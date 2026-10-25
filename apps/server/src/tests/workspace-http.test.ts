import { mkdtemp, readdir, rmdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { projectInputSchema, serverHistoryResponseSchema, defenseReportSchema, workspaceImportRequestSchema } from '@defense/shared'
import { createWorkflowFixture } from '../../../../tests/fixtures/workflow.js'
import { analysisProject } from '../../../../tests/fixtures/analysis.js'
import { createWorkspaceDatabase, type WorkspaceDatabase } from '../storage/database.js'
import { createApp } from '../app.js'

const databases: WorkspaceDatabase[] = [], directories: string[] = []
afterEach(async () => {
  for (const database of databases.splice(0)) await database.close()
  for (const directory of directories.splice(0)) {
    // The fixture's JSON config and attachment directory are not used in these cases.
    for (const file of await readdir(directory)) await unlink(join(directory, file))
    await rmdir(directory)
  }
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'sqlite-http-test-'))
  directories.push(directory)
  const database = createWorkspaceDatabase(join(directory, 'workspace.sqlite'))
  databases.push(database)
  return { database, directory, ...createWorkflowFixture(directory, { database }) }
}

describe('server-authoritative SQLite HTTP workflow', () => {
  it('persists project, analysis, real question/answer rows, report and independent retraining across restart', async () => {
    const env = await setup(), api = request(env.app), input = projectInputSchema.parse(analysisProject), requestId = crypto.randomUUID()
    const created = await api.post('/api/v1/projects').send({ requestId, input }).expect(201)
    expect((await api.post('/api/v1/projects').send({ requestId, input }).expect(201)).body).toEqual(created.body)
    await api.post('/api/v1/projects').send({ requestId, input: { ...input, name: '不能覆盖' } }).expect(409)
    const project = created.body.data
    const analysis = (await api.post('/api/v1/projects/analyze').send({ project, mode: 'live' }).expect(200)).body.data
    expect((await api.get(`/api/v1/projects/${project.id}/analyses`).expect(200)).body.data).toEqual([analysis])
    const sessionId = crypto.randomUUID(), body = { requestId: sessionId, project, analysis, mode: 'live', judgeId: 'business' }
    await api.post('/api/v1/defense/sessions').send({ ...body, analysis: { ...analysis, id: crypto.randomUUID() } }).expect(409)
    await api.post('/api/v1/defense/sessions').send(body).expect(201)
    const base = '/api/v1/defense/sessions/' + sessionId
    const first = (await api.post(base + '/question').send({ requestId: crypto.randomUUID() }).expect(200)).body.data
    const answer = { requestId: crypto.randomUUID(), questionId: first.currentQuestionId, answer: '计划访谈二十名学生，尚无试点结果。' }
    const second = await api.post(base + '/answer').send(answer).expect(200)
    expect((await api.post(base + '/answer').send(answer).expect(200)).body).toEqual(second.body)
    await api.post(base + '/end').send({}).expect(200)
    const report = defenseReportSchema.parse((await api.post(base + '/report').send({}).expect(200)).body.data)
    expect(report.version).toBe(2)
    expect(env.calls.defense_report).toBe(1)
    await api.post('/api/v1/improvements').send({ sourceSessionId: sessionId, improvementIndex: 0 }).expect(201)
    const training = (await api.post(base + '/retrain').send({ requestId: crypto.randomUUID(), judgeId: 'technical' }).expect(201)).body.data
    expect(training.id).not.toBe(sessionId)
    expect(training.training.sourceReportId).toBe(report.id)
    const history = serverHistoryResponseSchema.parse((await api.get('/api/v1/history').expect(200)).body).data
    expect(history.entries.find(entry => entry.session.id === sessionId)?.report).toEqual(report)
    await env.database.close()
    const restarted = createWorkspaceDatabase(join(env.directory, 'workspace.sqlite'))
    databases.push(restarted)
    const reopened = request(createApp({ workspace: restarted }))
    const restored = (await reopened.get('/api/v1/history').expect(200)).body.data
    expect(restored.entries.find((entry: {session: {id: string}}) => entry.session.id === sessionId).report).toEqual(report)
    expect((await reopened.get('/api/v1/projects').expect(200)).body.data.projects).toContainEqual(project)
    expect((await reopened.get('/api/v1/improvements').expect(200)).body.data).toHaveLength(1)
    expect((await reopened.get(base).expect(200)).body.data.id).toBe(sessionId)
    expect((await reopened.get(base + '/report').expect(200)).body.data).toEqual(report)
    expect(env.calls.defense_report).toBe(1)
  })

  it('rejects stale project edits and analysis while preserving saved versions and archive state', async () => {
    const env = await setup(), api = request(env.app)
    const project = (await api.post('/api/projects').send({ requestId: crypto.randomUUID(), input: projectInputSchema.parse(analysisProject) }).expect(201)).body.data
    const update = { expectedUpdatedAt: project.updatedAt, input: { ...projectInputSchema.parse(project), description: '更新后的项目介绍。' } }
    const next = (await api.put(`/api/projects/${project.id}`).send(update).expect(200)).body.data
    expect((await api.put(`/api/projects/${project.id}`).send(update).expect(200)).body.data).toEqual(next)
    await api.put(`/api/projects/${project.id}`).send({ ...update, input: { ...update.input, name: '过期编辑' } }).expect(409)
    await api.post('/api/projects/analyze').send({ project, mode: 'live' }).expect(409)
    expect(env.calls.project_analysis).toBe(0)
    const archived = (await api.patch(`/api/projects/${project.id}/archive`).send({ archived: true }).expect(200)).body.data
    expect(archived.archivedIds).toEqual([project.id])
    expect(archived.revisions.find((entry: {projectId: string}) => entry.projectId === project.id).snapshots).toContainEqual(project)
    await api.put('/api/projects/not-id').send(update).expect(400)
  })

  it('requires explicit local import and uses a server receipt for safe browser retries', async () => {
    const env = await setup(), api = request(env.app)
    const input = workspaceImportRequestSchema.parse({ requestId: crypto.randomUUID(), projects: { version: 1, projects: [analysisProject] }, analyses: [], history: null, tasks: [] })
    await api.post('/api/v1/workspace/import').send(input).expect(403)
    await api.post('/api/v1/workspace/import').set('X-Workspace-Request', '1').set('Host', 'localhost').set('Origin', 'https://untrusted.invalid').send(input).expect(403)
    const imported = await api.post('/api/v1/workspace/import').set('X-Workspace-Request', '1').set('Host', 'localhost').send(input).expect(200)
    expect(imported.body.data.counts.projects).toBe(1)
    const repeated = await api.post('/api/v1/workspace/import').set('X-Workspace-Request', '1').set('Host', 'localhost').send(input).expect(200)
    expect(repeated.body.data.alreadyImported).toBe(true)
    expect((await api.get('/api/v1/workspace/import/' + input.requestId).expect(200)).body.data.requestId).toBe(input.requestId)
    expect((await api.get('/api/v1/workspace/import/' + crypto.randomUUID()).expect(200)).body.data).toBeNull()
    expect((await api.get('/api/v1/projects').expect(200)).body.data.projects).toEqual([analysisProject])
  })
})
