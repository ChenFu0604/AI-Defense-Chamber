import { DatabaseSync } from 'node:sqlite'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  projectSchema, projectInputSchema, projectCollectionSchema, createProjectRecord,
  projectCreateRequestSchema, projectUpdateRequestSchema, analysisRecordSchema,
  defenseSessionSchema, defenseMessageSchema, defenseReportSchema, reportEvidenceIsValid,
  improvementTaskSchema, taskCreateRequestSchema, taskUpdateRequestSchema, createImprovementTask,
  workspaceImportRequestSchema, workspaceImportResultSchema, serverHistorySchema,
  type Project, type ProjectWorkspace, type AnalysisRecord, type DefenseSession, type DefenseReport,
  type ImprovementTask, type ProjectCreateRequest, type ProjectUpdateRequest, type TaskCreateRequest,
  type TaskUpdateRequest, type WorkspaceImportRequest, type WorkspaceImportResult, type ServerHistory,
} from '@defense/shared'
import { AppError } from '../middleware/app-error.js'
import { reportSourceFingerprint } from '../services/report-context.js'
import type { DefenseRepository } from '../services/defense-repository.js'
import type { ReportRepository } from '../services/report-repository.js'
import { workspaceSchema } from './schema.js'
import { readLegacyRecords, type LegacyRecords } from './legacy-import.js'

const dataDirectory = fileURLToPath(new URL('../../.data/', import.meta.url))
type Row = Record<string, unknown>
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => JSON.stringify(key) + ':' + stable(v)).join(',') + '}'
  return JSON.stringify(value)
}
const equal = (a: unknown, b: unknown) => stable(a) === stable(b)
const fingerprint = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex')
function identifier(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError(400, 'VALIDATION_ERROR', '记录 ID 无效。')
}
function conflict(message: string): never { throw new AppError(409, 'WORKSPACE_CONFLICT', message) }
const timestampAfter = (timestamp: string) => new Date(Math.max(Date.now(), Date.parse(timestamp) + 1)).toISOString()

export interface WorkspaceDatabase {
  initialize(): Promise<void>
  listProjects(): Promise<ProjectWorkspace>
  getProject(id: string): Promise<Project | null>
  createProject(input: ProjectCreateRequest): Promise<Project>
  updateProject(id: string, input: ProjectUpdateRequest): Promise<Project>
  setArchived(id: string, archived: boolean): Promise<ProjectWorkspace>
  listAnalyses(projectId?: string): Promise<AnalysisRecord[]>
  saveAnalysis(input: AnalysisRecord): Promise<void>
  getSession(id: string): Promise<DefenseSession | null>
  saveSession(input: DefenseSession): Promise<void>
  getReport(sessionId: string): Promise<DefenseReport | null>
  saveReport(input: DefenseReport): Promise<void>
  listHistory(): Promise<ServerHistory>
  listTasks(): Promise<ImprovementTask[]>
  addTask(input: TaskCreateRequest): Promise<ImprovementTask[]>
  updateTask(id: string, input: TaskUpdateRequest): Promise<ImprovementTask[]>
  importBrowser(input: WorkspaceImportRequest): Promise<WorkspaceImportResult>
  getBrowserImport(requestId: string): Promise<WorkspaceImportResult | null>
  close(): Promise<void>
}

/** A lazy connection: importing app/services never opens the user's database. */
export function createWorkspaceDatabase(filename?: string, options: { legacyDirectory?: string } = {}): WorkspaceDatabase {
  let connection: DatabaseSync | null = null
  let initializing: Promise<void> | null = null
  let closed = false
  const db = () => {
    if (!connection) throw new AppError(503, 'WORKSPACE_UNAVAILABLE', '训练数据库尚未就绪。')
    return connection
  }
  const one = (sql: string, ...args: (string | number | null)[]) => db().prepare(sql).get(...args) as Row | undefined
  const all = (sql: string, ...args: (string | number | null)[]) => db().prepare(sql).all(...args) as Row[]
  const run = (sql: string, ...args: (string | number | null)[]) => db().prepare(sql).run(...args)
  function record<T>(schema: z.ZodType<T>, row: Row | undefined): T | null {
    if (!row) return null
    try { return schema.parse(JSON.parse(String(row.data_json))) }
    catch { throw new AppError(500, 'WORKSPACE_STORAGE_CORRUPT', '训练数据库记录损坏或版本不兼容，原数据未覆盖。') }
  }
  function transaction<T>(work: () => T): T {
    db().exec('BEGIN IMMEDIATE')
    try { const result = work(); db().exec('COMMIT'); return result }
    catch (error) { db().exec('ROLLBACK'); throw error }
  }
  async function ready<T>(work: () => T): Promise<T> {
    await initialize()
    try { return work() }
    catch (error) {
      if (error instanceof AppError || error instanceof z.ZodError) throw error
      throw new AppError(500, 'WORKSPACE_STORAGE_ERROR', '训练数据库读写失败，未确认保存成功。请检查磁盘与文件权限后重试。')
    }
  }
  function project(id: string) {
    const value = record(projectSchema, one('SELECT data_json FROM projects WHERE id=?', id))
    if (value && value.id !== id) throw new AppError(500, 'WORKSPACE_STORAGE_CORRUPT', '项目标识与数据库记录不一致，原数据未覆盖。')
    return value
  }
  function session(id: string) {
    const value = record(defenseSessionSchema, one('SELECT data_json FROM defense_sessions WHERE id=?', id))
    if (!value) return null
    if (value.id !== id) throw new AppError(500, 'WORKSPACE_STORAGE_CORRUPT', '会话标识与数据库记录不一致，原数据未覆盖。')
    const questionRows = all('SELECT * FROM defense_questions WHERE session_id=? ORDER BY ordinal', id),
      answerRows = all('SELECT * FROM defense_answers WHERE session_id=? ORDER BY ordinal', id)
    const corrupt = () => { throw new AppError(500, 'WORKSPACE_STORAGE_CORRUPT', '训练消息表与会话快照不一致，原数据未覆盖。') }
    if (questionRows.length + answerRows.length !== value.messages.length) corrupt()
    for (const [rows, sender] of [[questionRows, 'judge'], [answerRows, 'user']] as const) {
      for (const row of rows) {
        const stored = record(defenseMessageSchema, row), message = value.messages[Number(row.ordinal)]
        if (!stored || !message || message.sender !== sender || !equal(stored, message) ||
            row.id !== message.id || row.judge_id !== message.judgeId || row.content !== message.content ||
            row.created_at !== message.createdAt || row.status !== message.status ||
            (sender === 'judge' ? row.question_type !== message.question?.questionType :
              row.question_id !== message.replyTo || row.request_id !== message.requestId)) corrupt()
      }
    }
    return value
  }
  function report(id: string) {
    const value = record(defenseReportSchema, one('SELECT data_json FROM defense_reports WHERE session_id=?', id))
    if (value && value.sessionId !== id) throw new AppError(500, 'WORKSPACE_STORAGE_CORRUPT', '报告关联与数据库记录不一致，原数据未覆盖。')
    return value
  }
  function projectVersion(value: Project) {
    const previous = record(projectSchema, one('SELECT data_json FROM project_versions WHERE project_id=? AND updated_at=?', value.id, value.updatedAt))
    if (previous && !equal(previous, value)) conflict('同一项目版本的资料不同，未覆盖已有项目或历史版本。')
    if (!previous) run('INSERT INTO project_versions(project_id,updated_at,data_json) VALUES(?,?,?)', value.id, value.updatedAt, JSON.stringify(value))
  }
  function putProject(value: Project, source: 'current' | 'snapshot', imported = false) {
    const current = project(value.id),
      row = one('SELECT origin FROM projects WHERE id=?', value.id)
    if (!current) {
      run('INSERT INTO projects(id,updated_at,created_at,origin,data_json) VALUES(?,?,?,?,?)', value.id, value.updatedAt, value.createdAt, source, JSON.stringify(value))
      projectVersion(value)
      return
    }
    if (source === 'current' && !equal(current, value)) {
      if (imported && row?.origin !== 'snapshot') conflict('浏览器项目与服务端已有项目不同，未自动覆盖。请先核对两个版本。')
      projectVersion(current)
      run('UPDATE projects SET updated_at=?,created_at=?,origin=?,data_json=? WHERE id=?', value.updatedAt, value.createdAt, source, JSON.stringify(value), value.id)
    } else if (source === 'current') run("UPDATE projects SET origin='current' WHERE id=?", value.id)
    else if (row?.origin === 'snapshot' && Date.parse(value.updatedAt) > Date.parse(current.updatedAt)) {
      run('UPDATE projects SET updated_at=?,created_at=?,data_json=? WHERE id=?', value.updatedAt, value.createdAt, JSON.stringify(value), value.id)
    }
    projectVersion(value)
  }
  function putAnalysis(value: AnalysisRecord) {
    const current = record(analysisRecordSchema, one('SELECT data_json FROM project_analyses WHERE id=?', value.id))
    if (current && !equal(current, value)) conflict('同一画像 ID 的内容不同，未覆盖已有分析。')
    if (!project(value.projectId)) throw new AppError(404, 'PROJECT_NOT_FOUND', '项目不存在，分析未保存。')
    if (!current) run('INSERT INTO project_analyses(id,project_id,mode,created_at,data_json) VALUES(?,?,?,?,?)', value.id, value.projectId, value.mode, value.createdAt, JSON.stringify(value))
  }
  function putSession(value: DefenseSession, importing = false) {
    const current = session(value.id)
    if (importing && current) {
      if (!equal(current, value)) conflict('导入会话与服务端已有记录不同，原训练记录未覆盖。')
      return
    }
    if (current && (current.project.id !== value.project.id || current.createFingerprint !== value.createFingerprint))
      conflict('会话的原项目或创建请求发生变化，未覆盖原训练。')
    const savedReport = report(value.id)
    if (savedReport && savedReport.sourceFingerprint !== reportSourceFingerprint(value))
      conflict('该会话已有评分报告，不能更改报告依据的原训练记录。')
    putProject(value.project, 'snapshot')
    putAnalysis(value.analysis)
    for (const message of value.messages.filter(item => item.sender === 'user')) {
      if (!value.messages.some(question => question.id === message.replyTo && question.sender === 'judge'))
        throw new AppError(422, 'SESSION_INVALID_HISTORY', '回答缺少本场关联问题，训练记录未保存。')
    }
    run(`INSERT INTO defense_sessions(id,project_id,status,created_at,updated_at,data_json) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,data_json=excluded.data_json`,
      value.id, value.project.id, value.status, value.createdAt, value.updatedAt, JSON.stringify(value))
    // Replace the bounded normalized projection in the same transaction as its full snapshot.
    run('DELETE FROM defense_answers WHERE session_id=?', value.id)
    run('DELETE FROM defense_questions WHERE session_id=?', value.id)
    value.messages.forEach((message, ordinal) => {
      if (message.sender === 'judge') run(`INSERT INTO defense_questions(id,session_id,ordinal,judge_id,question_type,content,created_at,status,data_json)
        VALUES(?,?,?,?,?,?,?,?,?)`, message.id, value.id, ordinal, message.judgeId, message.question!.questionType, message.content, message.createdAt, message.status, JSON.stringify(message))
    })
    value.messages.forEach((message, ordinal) => {
      if (message.sender === 'user') run(`INSERT INTO defense_answers(id,session_id,question_id,ordinal,request_id,judge_id,content,created_at,status,data_json)
        VALUES(?,?,?,?,?,?,?,?,?,?)`, message.id, value.id, message.replyTo!, ordinal, message.requestId, message.judgeId, message.content, message.createdAt, message.status, JSON.stringify(message))
    })
  }
  function putReport(value: DefenseReport) {
    const original = session(value.sessionId)
    if (!original || original.status !== 'ended' || original.mode !== 'live' || original.project.id !== value.projectId ||
        value.sourceFingerprint !== reportSourceFingerprint(original) || !reportEvidenceIsValid(value.output, original))
      throw new AppError(422, 'REPORT_SOURCE_MISMATCH', '报告与服务端已结束训练不匹配，未保存或覆盖报告。')
    const current = report(value.sessionId)
    if (current && !equal(current, value)) conflict('该训练已经保存不同报告，未覆盖原评分。')
    if (!current) run(`INSERT INTO defense_reports(id,session_id,project_id,version,overall_score,source_fingerprint,created_at,data_json)
      VALUES(?,?,?,?,?,?,?,?)`, value.id, value.sessionId, value.projectId, value.version, value.overallScore, value.sourceFingerprint, value.createdAt, JSON.stringify(value))
  }
  function putTask(value: ImprovementTask) {
    const source = report(value.sourceSessionId)
    if (!source || source.id !== value.sourceReportId || source.projectId !== value.projectId)
      throw new AppError(422, 'TASK_SOURCE_MISMATCH', '改进任务没有匹配的服务端原报告，未保存。')
    const expected = createImprovementTask(source, value.improvementIndex, value.projectName, value.id, value.createdAt)
    for (const key of ['title', 'action', 'acceptanceCriteria', 'dimension', 'priority', 'references'] as const)
      if (!equal(value[key], expected[key])) throw new AppError(422, 'TASK_SOURCE_MISMATCH', '改进任务与原报告建议不一致，未保存。')
    run(`INSERT INTO improvement_tasks(id,project_id,report_id,session_id,improvement_index,updated_at,data_json)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,data_json=excluded.data_json`,
      value.id, value.projectId, value.sourceReportId, value.sourceSessionId, value.improvementIndex, value.updatedAt, JSON.stringify(value))
  }
  function projects(): ProjectWorkspace {
    const rows = all('SELECT data_json,archived FROM projects ORDER BY created_at DESC,id')
    const saved = rows.map(row => record(projectSchema, row)!)
    return projectCollectionSchema.parse({ version: 1, projects: saved,
      archivedIds: rows.flatMap((row, index) => row.archived ? [saved[index]!.id] : []),
      revisions: saved.map(value => ({ projectId: value.id,
        snapshots: all('SELECT data_json FROM project_versions WHERE project_id=? AND updated_at<>? ORDER BY updated_at', value.id, value.updatedAt)
          .map(row => record(projectSchema, row)!),
      })).filter(value => value.snapshots.length),
    })
  }
  const analyses = (id?: string) => all('SELECT data_json FROM project_analyses' + (id ? ' WHERE project_id=?' : '') + ' ORDER BY created_at DESC,id', ...(id ? [id] : []))
    .map(row => record(analysisRecordSchema, row)!)
  const tasks = () => all('SELECT data_json FROM improvement_tasks ORDER BY updated_at DESC,id').map(row => record(improvementTaskSchema, row)!)
  function operation<T>(id: string, input: unknown): T | null {
    const row = one('SELECT fingerprint,result_json FROM workspace_operations WHERE id=?', id)
    if (!row) return null
    if (row.fingerprint !== fingerprint(input)) conflict('同一请求 ID 对应不同内容，未执行或覆盖原操作。')
    return JSON.parse(String(row.result_json)) as T
  }
  const receipt = (id: string, input: unknown, result: unknown) => run('INSERT INTO workspace_operations(id,fingerprint,result_json) VALUES(?,?,?)', id, fingerprint(input), JSON.stringify(result))
  function importLegacy(value: LegacyRecords) {
    transaction(() => {
      const imported = new Set<string>()
      for (const file of value.files) {
        const previous = one('SELECT fingerprint FROM legacy_imports WHERE filename=?', file.filename)
        if (previous && previous.fingerprint !== file.fingerprint) conflict('已迁移的旧 JSON 文件发生变化，未覆盖数据库；请核对原文件。')
        if (previous) imported.add(file.filename)
      }
      // Unchanged source files are receipts, not an instruction to rewind live SQLite records.
      for (const item of value.sessions) if (!imported.has('defense-sessions/' + item.id + '.json')) putSession(item, true)
      for (const item of value.reports) if (!imported.has('defense-reports/' + item.sessionId + '.json')) putReport(item)
      for (const file of value.files) run('INSERT OR IGNORE INTO legacy_imports(filename,fingerprint,imported_at) VALUES(?,?,?)', file.filename, file.fingerprint, new Date().toISOString())
    })
  }
  async function initialize() {
    if (closed) throw new AppError(503, 'WORKSPACE_CLOSED', '训练数据库已关闭。')
    if (initializing) return initializing
    initializing = (async () => {
      const path = filename ?? process.env.DEFENSE_DATABASE_PATH ?? dataDirectory + 'defense-chamber.sqlite'
      const legacyDirectory = options.legacyDirectory ?? (filename === undefined ? dataDirectory : undefined)
      // Read and validate all legacy sources before any record migration. Never delete them.
      const legacy = legacyDirectory ? await readLegacyRecords(legacyDirectory) : null
      try {
        if (path !== ':memory:') await mkdir(dirname(path), { recursive: true })
        connection = new DatabaseSync(path)
        db().exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
        const hasMigrations = one("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        const version = hasMigrations ? one('SELECT MAX(version) AS version FROM schema_migrations')?.version : null
        if (version !== null && version !== undefined && version !== 1)
          throw new AppError(500, 'WORKSPACE_VERSION_UNSUPPORTED', '训练数据库版本不受支持，原数据未改写。')
        db().exec(workspaceSchema)
        if (version === null || version === undefined) run('INSERT INTO schema_migrations(version,applied_at) VALUES(1,?)', new Date().toISOString())
        if (legacy) importLegacy(legacy)
      } catch (error) {
        connection?.close(); connection = null
        if (error instanceof AppError) throw error
        throw new AppError(500, 'WORKSPACE_STORAGE_ERROR', '无法初始化训练数据库，原记录未删除；请检查磁盘、权限或迁移冲突。')
      }
    })()
    try { await initializing } catch (error) { initializing = null; throw error }
  }
  return {
    initialize,
    listProjects: () => ready(projects),
    getProject(id) { identifier(id); return ready(() => project(id)) },
    createProject(input) { const parsed = projectCreateRequestSchema.parse(input); return ready(() => transaction(() => {
      const key = 'project-create:' + parsed.requestId,
        previous = operation<Project>(key, parsed)
      if (previous) return projectSchema.parse(previous)
      if (project(parsed.requestId)) conflict('项目 ID 已被其他记录使用，未覆盖已有资料。')
      const value = createProjectRecord(parsed.input, parsed.requestId, new Date().toISOString())
      putProject(value, 'current'); receipt(key, parsed, value); return value
    })) },
    updateProject(id, input) { identifier(id); const parsed = projectUpdateRequestSchema.parse(input); return ready(() => transaction(() => {
      const current = project(id)
      if (!current) throw new AppError(404, 'PROJECT_NOT_FOUND', '原项目不存在，资料未保存。')
      if (equal(projectInputSchema.parse(current), parsed.input)) return current
      if (current.updatedAt !== parsed.expectedUpdatedAt) conflict('项目已在其他页面更新，当前输入未覆盖较新的资料。')
      const value = projectSchema.parse({ ...parsed.input, id, createdAt: current.createdAt, updatedAt: timestampAfter(current.updatedAt) })
      putProject(value, 'current'); return value
    })) },
    setArchived(id, archived) { identifier(id); return ready(() => transaction(() => {
      if (!project(id)) throw new AppError(404, 'PROJECT_NOT_FOUND', '项目不存在。')
      run('UPDATE projects SET archived=? WHERE id=?', archived ? 1 : 0, id); return projects()
    })) },
    listAnalyses(id) { if (id) identifier(id); return ready(() => analyses(id)) },
    saveAnalysis(input) { const parsed = analysisRecordSchema.parse(input); return ready(() => transaction(() => putAnalysis(parsed))) },
    getSession(id) { identifier(id); return ready(() => session(id)) },
    saveSession(input) { const parsed = defenseSessionSchema.parse(input); return ready(() => transaction(() => putSession(parsed))) },
    getReport(id) { identifier(id); return ready(() => report(id)) },
    saveReport(input) { const parsed = defenseReportSchema.parse(input); return ready(() => transaction(() => putReport(parsed))) },
    listHistory: () => ready(() => serverHistorySchema.parse({ version: 1, projects: projects().projects, analyses: analyses(),
      entries: all('SELECT id FROM defense_sessions ORDER BY created_at DESC,id').map(row => {
        const value = session(String(row.id))!
        return { session: value, report: report(value.id), archivedAt: value.updatedAt }
      }),
    })),
    listTasks: () => ready(tasks),
    addTask(input) { const parsed = taskCreateRequestSchema.parse(input); return ready(() => transaction(() => {
      const source = report(parsed.sourceSessionId), original = session(parsed.sourceSessionId)
      if (!source || !original) throw new AppError(404, 'REPORT_NOT_FOUND', '请先生成并保存原训练报告。')
      if (!source.output.improvements[parsed.improvementIndex]) throw new AppError(400, 'VALIDATION_ERROR', '报告中不存在这项建议。')
      if (one('SELECT id FROM improvement_tasks WHERE report_id=? AND improvement_index=?', source.id, parsed.improvementIndex)) return tasks()
      putTask(createImprovementTask(source, parsed.improvementIndex, original.project.name, randomUUID(), new Date().toISOString())); return tasks()
    })) },
    updateTask(id, input) { identifier(id); const parsed = taskUpdateRequestSchema.parse(input); return ready(() => transaction(() => {
      const current = record(improvementTaskSchema, one('SELECT data_json FROM improvement_tasks WHERE id=?', id))
      if (!current) throw new AppError(404, 'TASK_NOT_FOUND', '改进任务不存在。')
      if (equal({status: current.status, note: current.note, ...(current.attachments ? {attachments: current.attachments} : {})}, parsed.update)) return tasks()
      if (current.updatedAt !== parsed.expectedUpdatedAt) conflict('任务已在其他页面更新，未覆盖较新的进展。')
      putTask(improvementTaskSchema.parse({ ...current, ...parsed.update, attachments: parsed.update.attachments, updatedAt: timestampAfter(current.updatedAt) })); return tasks()
    })) },
    importBrowser(input) { const parsed = workspaceImportRequestSchema.parse(input); return ready(() => transaction(() => {
      const key = 'browser-import:' + parsed.requestId, previous = operation<WorkspaceImportResult>(key, parsed)
      if (previous) return workspaceImportResultSchema.parse({ ...previous, alreadyImported: true })
      const counts = {projects: 0, analyses: 0, sessions: 0, reports: 0, tasks: 0}
      for (const value of parsed.projects.projects) { putProject(value, 'current', true); counts.projects++ }
      for (const value of parsed.projects.revisions) for (const snapshot of value.snapshots) projectVersion(snapshot)
      for (const id of parsed.projects.archivedIds) run('UPDATE projects SET archived=1 WHERE id=?', id)
      for (const value of parsed.history?.projects ?? []) putProject(value, 'snapshot')
      const entries = parsed.history?.entries ?? []
      for (const value of entries) { putSession(value.session, true); counts.sessions++ }
      const importedAnalyses = new Map<string, AnalysisRecord>()
      for (const value of [...(parsed.history?.analyses ?? []), ...parsed.analyses]) {
        const previous = importedAnalyses.get(value.id)
        if (previous && !equal(previous, value)) conflict('导入材料中的同一画像 ID 内容不同，迁移已停止。')
        importedAnalyses.set(value.id, value)
      }
      for (const value of importedAnalyses.values()) { putAnalysis(value); counts.analyses++ }
      for (const value of entries) if (value.report) { putReport(value.report); counts.reports++ }
      for (const value of parsed.tasks) {
        const current = record(improvementTaskSchema, one('SELECT data_json FROM improvement_tasks WHERE id=?', value.id))
        if (current && !equal(current, value)) conflict('浏览器任务与服务端已有进展不同，原进展未覆盖。')
        const duplicate = one('SELECT id FROM improvement_tasks WHERE report_id=? AND improvement_index=?', value.sourceReportId, value.improvementIndex)
        if (duplicate && duplicate.id !== value.id) conflict('同一报告建议已有不同任务记录，未重复导入。')
        putTask(value); counts.tasks++
      }
      const result = workspaceImportResultSchema.parse({requestId: parsed.requestId, alreadyImported: false, counts})
      receipt(key, parsed, result); return result
    })) },
    getBrowserImport(id) { identifier(id); return ready(() => {
      const row = one('SELECT result_json FROM workspace_operations WHERE id=?', 'browser-import:' + id)
      return row ? workspaceImportResultSchema.parse({...JSON.parse(String(row.result_json)), alreadyImported: true}) : null
    }) },
    async close() { if (initializing) await initializing.catch(() => undefined); connection?.close(); connection = null; closed = true },
  }
}

export const workspaceDatabase = createWorkspaceDatabase()
export function createSqliteDefenseRepository(database: WorkspaceDatabase = workspaceDatabase): DefenseRepository {
  return { get: id => database.getSession(id), save: value => database.saveSession(value) }
}
export function createSqliteReportRepository(database: WorkspaceDatabase = workspaceDatabase): ReportRepository {
  return { get: id => database.getReport(id), save: value => database.saveReport(value) }
}
