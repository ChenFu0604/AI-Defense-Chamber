import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { createImprovementTask, projectInputSchema, defenseSessionSchema, type WorkspaceImportRequest } from '@defense/shared'
import { createWorkspaceDatabase, createSqliteDefenseRepository, createSqliteReportRepository, type WorkspaceDatabase } from '../storage/database.js'
import { reportSourceFingerprint } from '../services/report-context.js'
import { endedReportSession, reportFixture, legacyReportFixture } from '../../../../tests/fixtures/report.js'
import { defenseFixture } from '../../../../tests/fixtures/defense.js'

const opened: WorkspaceDatabase[] = []
const directories: string[] = []
const database = (filename = ':memory:', options?: {legacyDirectory?: string}) => {
  const value = createWorkspaceDatabase(filename, options); opened.push(value); return value
}
async function directory() { const value = await mkdtemp(join(tmpdir(), 'workspace-sqlite-test-')); directories.push(value); return value }
afterEach(async () => {
  for (const value of opened.splice(0)) await value.close()
  // Every path was created by mkdtemp above; none refers to a user's workspace/data.
  for (const value of directories.splice(0)) {
    if (!value.startsWith(join(tmpdir(), 'workspace-sqlite-test-'))) throw new Error('unexpected cleanup path')
    await rm(value, {recursive: true, force: true})
  }
})
function records() {
  const session = defenseSessionSchema.parse(endedReportSession()), report = reportFixture()
  report.sourceFingerprint = reportSourceFingerprint(session)
  return {session, report}
}
function browserInput(): WorkspaceImportRequest {
  const {session, report} = records()
  const newer = {...session.project, name: '浏览器中的最新项目', updatedAt: '2026-10-25T04:00:00.000Z'}
  return {requestId: randomUUID(), projects: {version: 1, projects: [newer], revisions: [], archivedIds: []},
    analyses: [session.analysis], history: {version: 1, projects: [session.project], analyses: [],
      entries: [{session, report, archivedAt: session.updatedAt}]}, tasks: []}
}

describe('SQLite workspace projects and atomic training records', () => {
  it('creates, reopens and updates projects with idempotency, version history and CAS', async () => {
    const root = await directory(), path = join(root, 'workspace.sqlite'), store = database(path)
    const input = {requestId: randomUUID(), input: projectInputSchema.parse(defenseFixture().project)}
    const first = await store.createProject(input)
    expect(await store.createProject(input)).toEqual(first)
    await expect(store.createProject({...input, input: {...input.input, name: '不同请求'}})).rejects.toMatchObject({code: 'WORKSPACE_CONFLICT'})
    const next = await store.updateProject(first.id, {expectedUpdatedAt: first.updatedAt, input: {...input.input, name: '已更新'}})
    expect(Date.parse(next.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt))
    await expect(store.updateProject(first.id, {expectedUpdatedAt: first.updatedAt, input: {...input.input, name: '过期更新'}})).rejects.toMatchObject({code: 'WORKSPACE_CONFLICT'})
    expect(await store.updateProject(first.id, {expectedUpdatedAt: first.updatedAt, input: projectInputSchema.parse(next)})).toEqual(next)
    await store.setArchived(first.id, true)
    await store.close()
    const reopened = database(path), workspace = await reopened.listProjects()
    expect(workspace.projects).toEqual([next])
    expect(workspace.revisions[0]?.snapshots).toEqual([first])
    expect(workspace.archivedIds).toEqual([first.id])
  })
  it('stores actual question/answer rows, snapshots, analyses and reports in one database', async () => {
    const root = await directory(), path = join(root, 'workspace.sqlite'), store = database(path), {session, report} = records()
    await createSqliteDefenseRepository(store).save(session)
    await createSqliteReportRepository(store).save(report)
    expect(await store.listAnalyses(session.project.id)).toEqual([session.analysis])
    const inspector = new DatabaseSync(path)
    expect(inspector.prepare('SELECT content,question_type FROM defense_questions').all()).toMatchObject([{content: session.messages[0]!.content, question_type: 'evidence'}])
    expect(inspector.prepare('SELECT content,question_id FROM defense_answers').all()).toMatchObject([{content: session.messages[1]!.content, question_id: session.messages[0]!.id}])
    inspector.close()
    await store.close()
    const reopened = database(path)
    expect(await reopened.getSession(session.id)).toEqual(session)
    expect(await reopened.getReport(session.id)).toEqual(report)
    expect((await reopened.listHistory()).entries[0]).toMatchObject({session, report})
  })
  it('does not overwrite a current project with an older training snapshot', async () => {
    const store = database(), {session} = records(), input = browserInput()
    input.history = null; input.analyses = []
    await store.importBrowser(input)
    await store.saveSession(session)
    expect((await store.getProject(session.project.id))?.name).toBe('浏览器中的最新项目')
    expect((await store.getSession(session.id))?.project).toEqual(session.project)
  })
  it('rolls back projects, analyses, sessions and normalized rows when a message link is invalid', async () => {
    const store = database(), {session} = records()
    session.messages[1]!.replyTo = randomUUID()
    await expect(store.saveSession(session)).rejects.toMatchObject({code: 'SESSION_INVALID_HISTORY'})
    expect(await store.getSession(session.id)).toBeNull()
    expect((await store.listProjects()).projects).toEqual([])
    expect(await store.listAnalyses()).toEqual([])
  })
  it('keeps pending state, request ledger and failed answers exactly across a repository restart', async () => {
    const root = await directory(), path = join(root, 'workspace.sqlite'), store = database(path)
    const session = endedReportSession()
    session.status = 'failed'; session.endedAt = null; session.messages[1]!.status = 'failed'
    session.pending = {requestId: session.messages[1]!.requestId, fingerprint: 'a'.repeat(64), type: 'answer',
      questionId: session.messages[0]!.id, judgeId: session.currentJudgeId, answerMessageId: session.messages[1]!.id}
    await store.saveSession(session); await store.close()
    expect(await database(path).getSession(session.id)).toEqual(session)
  })
  it('rolls back a failed SQL projection update together with the complete session snapshot', async () => {
    const root = await directory(), path = join(root, 'workspace.sqlite'), store = database(path), {session} = records()
    await store.saveSession(session)
    const inspector = new DatabaseSync(path)
    inspector.exec("CREATE TRIGGER reject_answer BEFORE INSERT ON defense_answers BEGIN SELECT RAISE(ABORT, 'test write failure'); END;")
    const changed = structuredClone(session); changed.messages[1]!.content += '新增待保存内容'
    await expect(store.saveSession(changed)).rejects.toMatchObject({code: 'WORKSPACE_STORAGE_ERROR'})
    expect(await store.getSession(session.id)).toEqual(session)
    expect(inspector.prepare('SELECT content FROM defense_answers').get()).toMatchObject({content: session.messages[1]!.content})
    inspector.close()
  })
  it('rejects a damaged normalized message projection without repairing or overwriting it', async () => {
    const root = await directory(), path = join(root, 'workspace.sqlite'), store = database(path), {session} = records()
    await store.saveSession(session)
    const inspector = new DatabaseSync(path)
    inspector.prepare('UPDATE defense_answers SET content=? WHERE id=?').run('损坏的独立消息列', session.messages[1]!.id)
    await expect(store.getSession(session.id)).rejects.toMatchObject({code: 'WORKSPACE_STORAGE_CORRUPT'})
    await expect(store.listHistory()).rejects.toMatchObject({code: 'WORKSPACE_STORAGE_CORRUPT'})
    await expect(store.saveSession(session)).rejects.toMatchObject({code: 'WORKSPACE_STORAGE_CORRUPT'})
    expect(inspector.prepare('SELECT content FROM defense_answers').get()).toMatchObject({content: '损坏的独立消息列'})
    inspector.close()
  })
  it('rejects a valid JSON record whose identity disagrees with its SQLite key', async () => {
    const root = await directory(), path = join(root, 'workspace.sqlite'), store = database(path), {session, report} = records()
    await store.saveSession(session); await store.saveReport(report)
    const inspector = new DatabaseSync(path)
    inspector.prepare('UPDATE projects SET data_json=? WHERE id=?').run(JSON.stringify({...session.project, id: randomUUID()}), session.project.id)
    inspector.prepare('UPDATE defense_reports SET data_json=? WHERE session_id=?').run(JSON.stringify({...report, sessionId: randomUUID()}), session.id)
    await expect(store.getProject(session.project.id)).rejects.toMatchObject({code: 'WORKSPACE_STORAGE_CORRUPT'})
    await expect(store.getReport(session.id)).rejects.toMatchObject({code: 'WORKSPACE_STORAGE_CORRUPT'})
    inspector.close()
  })
  it('refuses changed report sources and invalid reports without overwriting valid records', async () => {
    const store = database(), {session, report} = records()
    await store.saveSession(session)
    await expect(store.saveReport({...report, sourceFingerprint: 'b'.repeat(64)})).rejects.toMatchObject({code: 'REPORT_SOURCE_MISMATCH'})
    await store.saveReport(report)
    await expect(store.saveReport({...report, id: randomUUID()})).rejects.toMatchObject({code: 'WORKSPACE_CONFLICT'})
    const changed = structuredClone(session); changed.messages[1]!.content += '改变评分依据'
    await expect(store.saveSession(changed)).rejects.toMatchObject({code: 'WORKSPACE_CONFLICT'})
    expect(await store.getSession(session.id)).toEqual(session)
    expect(await store.getReport(session.id)).toEqual(report)
  })
  it('stores task source from the saved report and rejects stale progress updates', async () => {
    const store = database(), {session, report} = records()
    await store.saveSession(session); await store.saveReport(report)
    const tasks = await store.addTask({sourceSessionId: session.id, improvementIndex: 0}), task = tasks[0]!
    expect(task.action).toBe(report.output.improvements[0]!.action)
    expect(await store.addTask({sourceSessionId: session.id, improvementIndex: 0})).toEqual(tasks)
    const updated = await store.updateTask(task.id, {expectedUpdatedAt: task.updatedAt, update: {status: 'in_progress', note: '补充实际材料'}})
    expect(updated[0]?.note).toBe('补充实际材料')
    await expect(store.updateTask(task.id, {expectedUpdatedAt: task.updatedAt, update: {status: 'done', note: '旧编辑'}})).rejects.toMatchObject({code: 'WORKSPACE_CONFLICT'})
  })
})

describe('SQLite browser and legacy import protection', () => {
  it('refuses an unsupported database version without creating current application tables', async () => {
    const root = await directory(), path = join(root, 'future.sqlite'), raw = new DatabaseSync(path)
    raw.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES(99,'2026-10-25');")
    raw.close()
    await expect(database(path).initialize()).rejects.toMatchObject({code: 'WORKSPACE_VERSION_UNSUPPORTED'})
    const check = new DatabaseSync(path)
    expect(check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([{name: 'schema_migrations'}])
    check.close()
  })
  it('imports browser current projects ahead of history and returns a stable idempotent receipt', async () => {
    const store = database(), input = browserInput(), entry = input.history!.entries[0]!
    const first = await store.importBrowser(input)
    expect(first.counts).toEqual({projects: 1, analyses: 1, sessions: 1, reports: 1, tasks: 0})
    expect((await store.getProject(entry.session.project.id))?.name).toBe('浏览器中的最新项目')
    expect((await store.getSession(entry.session.id))?.project.name).toBe(entry.session.project.name)
    expect(await store.importBrowser(input)).toEqual({...first, alreadyImported: true})
    expect(await store.getBrowserImport(input.requestId)).toEqual({...first, alreadyImported: true})
    expect(await store.getBrowserImport(randomUUID())).toBeNull()
    await expect(store.importBrowser({...input, tasks: [createImprovementTask(entry.report!, 0, entry.session.project.name, randomUUID(), new Date().toISOString())]})).rejects.toMatchObject({code: 'WORKSPACE_CONFLICT'})
  })
  it('rolls back the entire browser import when a report or task source conflicts', async () => {
    const store = database(), input = browserInput(), entry = input.history!.entries[0]!
    input.tasks = [{...createImprovementTask(entry.report!, 0, entry.session.project.name, randomUUID(), new Date().toISOString()), action: '伪造的报告建议'}]
    await expect(store.importBrowser(input)).rejects.toMatchObject({code: 'TASK_SOURCE_MISMATCH'})
    expect((await store.listProjects()).projects).toEqual([])
    expect(await store.getSession(entry.session.id)).toBeNull()
    expect(await store.getReport(entry.session.id)).toBeNull()
    input.tasks = []
    expect((await store.importBrowser(input)).alreadyImported).toBe(false)
  })
  it('migrates unchanged legacy JSON once, keeps originals and does not rewind later SQLite progress', async () => {
    const root = await directory(), legacy = join(root, 'legacy'), path = join(root, 'workspace.sqlite'), {session, report} = records()
    const oldReport = legacyReportFixture(); oldReport.sourceFingerprint = report.sourceFingerprint
    await mkdir(join(legacy, 'defense-sessions'), {recursive: true}); await mkdir(join(legacy, 'defense-reports'))
    const sessionFile = join(legacy, 'defense-sessions', session.id + '.json'), reportFile = join(legacy, 'defense-reports', session.id + '.json')
    const rawSession = JSON.stringify(session), rawReport = JSON.stringify(oldReport)
    await writeFile(sessionFile, rawSession); await writeFile(reportFile, rawReport)
    const store = database(path, {legacyDirectory: legacy})
    expect(await store.getSession(session.id)).toEqual(session)
    expect(await store.getReport(session.id)).toEqual(oldReport)
    expect(await readFile(sessionFile, 'utf8')).toBe(rawSession)
    expect(await readFile(reportFile, 'utf8')).toBe(rawReport)
    await store.close()
    const restarted = database(path, {legacyDirectory: legacy})
    expect(await restarted.getReport(session.id)).toEqual(oldReport)
    expect(await readdir(join(legacy, 'defense-reports'))).toEqual([session.id + '.json'])
  })
  it('does not reimport an unchanged migrated session after its SQLite state advances', async () => {
    const root = await directory(), legacy = join(root, 'legacy'), path = join(root, 'workspace.sqlite'), session = defenseFixture()
    await mkdir(join(legacy, 'defense-sessions'), {recursive: true})
    await writeFile(join(legacy, 'defense-sessions', session.id + '.json'), JSON.stringify(session))
    const store = database(path, {legacyDirectory: legacy})
    await store.initialize()
    const progressed = {...session, updatedAt: '2026-10-25T04:00:00.000Z'}
    await store.saveSession(progressed); await store.close()
    expect(await database(path, {legacyDirectory: legacy}).getSession(session.id)).toEqual(progressed)
  })
  it('rejects corrupt legacy input before importing any records and preserves source files', async () => {
    const root = await directory(), legacy = join(root, 'legacy'), {session} = records()
    await mkdir(join(legacy, 'defense-sessions'), {recursive: true})
    const valid = join(legacy, 'defense-sessions', session.id + '.json'), corrupt = join(legacy, 'defense-sessions', randomUUID() + '.json')
    await writeFile(valid, JSON.stringify(session)); await writeFile(corrupt, '{broken')
    const path = join(root, 'workspace.sqlite')
    await expect(database(path, {legacyDirectory: legacy}).initialize()).rejects.toMatchObject({code: 'WORKSPACE_MIGRATION_CORRUPT'})
    expect(await readFile(corrupt, 'utf8')).toBe('{broken')
    expect((await database(path).listHistory()).entries).toEqual([])
  })
  it('rejects source fingerprint mismatch and changed previously imported files without overwriting', async () => {
    const root = await directory(), legacy = join(root, 'legacy'), path = join(root, 'workspace.sqlite'), {session, report} = records()
    await mkdir(join(legacy, 'defense-sessions'), {recursive: true}); await mkdir(join(legacy, 'defense-reports'))
    const source = join(legacy, 'defense-sessions', session.id + '.json')
    await writeFile(source, JSON.stringify(session))
    const bad = {...report, sourceFingerprint: 'b'.repeat(64)}
    await writeFile(join(legacy, 'defense-reports', session.id + '.json'), JSON.stringify(bad))
    await expect(database(path, {legacyDirectory: legacy}).initialize()).rejects.toMatchObject({code: 'WORKSPACE_MIGRATION_CORRUPT'})
    await writeFile(join(legacy, 'defense-reports', session.id + '.json'), JSON.stringify(report))
    const store = database(path, {legacyDirectory: legacy}); await store.initialize(); await store.close()
    await writeFile(source, JSON.stringify(session, null, 2))
    await expect(database(path, {legacyDirectory: legacy}).initialize()).rejects.toMatchObject({code: 'WORKSPACE_CONFLICT'})
    expect(await database(path).getSession(session.id)).toEqual(session)
  })
})
