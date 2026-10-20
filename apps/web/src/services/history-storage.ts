import { z } from 'zod'
import {
  historyArchiveSchema,
  historyEntrySchema,
  projectSchema,
  analysisRecordSchema,
  defenseSessionSchema,
  defenseReportSchema,
  createDefenseRequestSchema,
  retrainRequestSchema,
  type HistoryArchive,
  type Project,
  type AnalysisRecord,
  type DefenseSession,
  type DefenseReport,
} from '@defense/shared'
import { getProjectStorage, type ProjectStorage } from './project-storage'

export const HISTORY_KEY = 'defense-chamber.history.v1'
export const HISTORY_MAX_BYTES = 3 * 1024 * 1024
const empty = (): HistoryArchive => ({ version: 1, projects: [], analyses: [], entries: [] })
export function readHistory(storage: ProjectStorage = getProjectStorage()): HistoryArchive {
  let raw: string | null
  try {
    raw = storage.getItem(HISTORY_KEY)
  } catch {
    throw new Error('无法读取本地历史，请检查浏览器存储权限。')
  }
  if (raw === null) return empty()
  try {
    const value = JSON.parse(raw)
    // Explicit migration for an earlier envelope without standalone project/analysis lists.
    if (
      value.version === 0 &&
      Array.isArray(value.entries) &&
      Object.keys(value).every((k) => ['version', 'entries'].includes(k))
    )
      return historyArchiveSchema.parse({ ...empty(), entries: value.entries })
    return historyArchiveSchema.parse(value)
  } catch {
    throw new Error('本地历史损坏、缺少字段或版本不兼容；原数据已保留，未覆盖。请先备份原数据。')
  }
}
function writeHistory(value: HistoryArchive, storage: ProjectStorage) {
  const payload = JSON.stringify(historyArchiveSchema.parse(value))
  if (payload.length * 2 > HISTORY_MAX_BYTES)
    throw new Error(
      '历史归档达到 3 MiB 容量上限，未删除或覆盖已有记录。请先导出备份并释放浏览器存储。',
    )
  try {
    storage.setItem(HISTORY_KEY, payload)
    if (storage.getItem(HISTORY_KEY) !== payload) throw new Error('unconfirmed')
  } catch {
    throw new Error(
      '无法确认历史已保存，可能存储空间不足或写入受限。后端会话仍保留，请勿把本地归档视为成功。',
    )
  }
}
export function archiveProject(input: Project, storage: ProjectStorage = getProjectStorage()) {
  const project = projectSchema.parse(input),
    archive = readHistory(storage)
  archive.projects = [project, ...archive.projects.filter((item) => item.id !== project.id)]
  writeHistory(archive, storage)
}
export function archiveAnalysis(
  input: AnalysisRecord,
  storage: ProjectStorage = getProjectStorage(),
) {
  const analysis = analysisRecordSchema.parse(input),
    archive = readHistory(storage)
  archive.analyses = [analysis, ...archive.analyses.filter((item) => item.id !== analysis.id)]
  writeHistory(archive, storage)
}
export function archiveSession(
  input: DefenseSession,
  storage: ProjectStorage = getProjectStorage(),
) {
  const session = defenseSessionSchema.parse(input),
    archive = readHistory(storage)
  const previous = archive.entries.find((item) => item.session.id === session.id)
  if (previous?.report && JSON.stringify(previous.session) !== JSON.stringify(session))
    throw new Error('已归档报告的会话快照发生变化，保留旧历史，请检查服务端数据。')
  if (previous && Date.parse(previous.session.updatedAt) > Date.parse(session.updatedAt)) return
  const entry = historyEntrySchema.parse({
    session,
    report: previous?.report ?? null,
    archivedAt: new Date().toISOString(),
  })
  archive.entries = [entry, ...archive.entries.filter((item) => item.session.id !== session.id)]
  writeHistory(archive, storage)
}
export function archiveReport(input: DefenseReport, storage: ProjectStorage = getProjectStorage()) {
  const report = defenseReportSchema.parse(input),
    archive = readHistory(storage)
  const entry = archive.entries.find((item) => item.session.id === report.sessionId)
  if (!entry) throw new Error('本地缺少完整会话快照，请先读取会话再保存报告归档。')
  if (entry.report && JSON.stringify(entry.report) !== JSON.stringify(report))
    throw new Error('已有历史报告与服务端结果不同，未覆盖旧评分。')
  entry.report = report
  entry.archivedAt = new Date().toISOString()
  writeHistory(archive, storage)
}
const pendingSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create'), input: createDefenseRequestSchema }),
  z.strictObject({ kind: z.literal('retrain'), sourceId: z.uuid(), input: retrainRequestSchema }),
])
export type PendingCreation = z.infer<typeof pendingSchema>
export const PENDING_CREATION_KEY = 'defense-chamber.pending-create.v1'
export function readPendingCreation(storage: ProjectStorage = getProjectStorage()) {
  const raw = storage.getItem(PENDING_CREATION_KEY)
  if (!raw || raw === 'null') return null
  const parsed = pendingSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error('待创建会话记录损坏，原记录未覆盖，请先备份恢复。')
  return parsed.data
}
export function savePendingCreation(
  input: PendingCreation | null,
  storage: ProjectStorage = getProjectStorage(),
) {
  readPendingCreation(storage)
  const payload = JSON.stringify(input ? pendingSchema.parse(input) : null)
  storage.setItem(PENDING_CREATION_KEY, payload)
  if (storage.getItem(PENDING_CREATION_KEY) !== payload)
    throw new Error('无法保存待创建会话，未发送创建请求，请检查存储。')
}
