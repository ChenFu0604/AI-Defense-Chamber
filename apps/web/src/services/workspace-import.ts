import { z } from 'zod'
import { workspaceImportRequestSchema, workspaceImportResponseSchema, workspaceImportResultSchema, type WorkspaceImportRequest, type WorkspaceImportResult } from '@defense/shared'
import { readProjectWorkspace, PROJECT_STORAGE_KEY, getProjectStorage } from './project-storage'
import { readAnalysisRecords, ANALYSIS_STORAGE_KEY } from './analysis-storage'
import { readHistory, HISTORY_KEY } from './history-storage'
import { readImprovementTasks, IMPROVEMENT_STORAGE_KEY } from './improvement-storage'
import { serverRequest } from './server-api'

const IMPORT_MARKER = 'defense-chamber.sqlite-import.v1'
const markerSchema = z.strictObject({fingerprint: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.uuid(), confirmed: z.boolean().optional()})
const formalKeys = [PROJECT_STORAGE_KEY, ANALYSIS_STORAGE_KEY, HISTORY_KEY, IMPROVEMENT_STORAGE_KEY]
function sourceBytes() {
  const storage = getProjectStorage()
  return JSON.stringify(formalKeys.map(key => [key, storage.getItem(key)]))
}
async function sourceFingerprint(bytes: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes))
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}
export interface BrowserImportPreview {
  fingerprint: string
  input: WorkspaceImportRequest
  counts: { projects: number; analyses: number; sessions: number; reports: number; tasks: number }
}
export async function prepareBrowserImport(): Promise<BrowserImportPreview | null> {
  const bytes = sourceBytes(), storage = getProjectStorage()
  if (formalKeys.every(key => storage.getItem(key) === null)) return null
  // Parse all sources before sending any of them. Corrupt data stays untouched.
  const projects = readProjectWorkspace(), analyses = readAnalysisRecords(), history = readHistory(), tasks = readImprovementTasks()
  const fingerprint = await sourceFingerprint(bytes)
  let previous: { fingerprint: string; requestId: string; confirmed?: boolean } | null = null
  try {
    const parsed = markerSchema.safeParse(JSON.parse(storage.getItem(IMPORT_MARKER) ?? 'null'))
    previous = parsed.success ? parsed.data : null
  }
  catch { /* A damaged UI marker never changes the legacy records. */ }
  if (previous?.fingerprint === fingerprint && previous.confirmed) {
    const receipt = await serverRequest('/workspace/import/' + previous.requestId,
      z.strictObject({ success: z.literal(true), data: workspaceImportResultSchema.nullable() }))
    if (receipt?.requestId === previous.requestId) return null
  }
  const requestId = previous?.fingerprint === fingerprint ? previous.requestId : crypto.randomUUID()
  const input = workspaceImportRequestSchema.parse({ requestId, projects, analyses, history, tasks })
  const counts = {
    projects: new Set([...projects.projects, ...history.projects, ...history.entries.map(entry => entry.session.project)].map(project => project.id)).size,
    analyses: new Set([...analyses, ...history.analyses].map(record => record.id)).size,
    sessions: history.entries.length,
    reports: history.entries.filter(entry => entry.report).length,
    tasks: tasks.length,
  }
  if (!Object.values(counts).some(value => value > 0)) return null
  // Persist the same request identity before the request, so a lost response can
  // safely be retried after refresh. No formal local record is deleted.
  storage.setItem(IMPORT_MARKER, JSON.stringify({ fingerprint, requestId }))
  return { fingerprint, input, counts }
}
export async function importBrowserRecords(preview: BrowserImportPreview): Promise<WorkspaceImportResult> {
  if (await sourceFingerprint(sourceBytes()) !== preview.fingerprint)
    throw new Error('浏览器旧记录在预览后发生变化，请重新检查后再导入。')
  const result = await serverRequest('/workspace/import', workspaceImportResponseSchema, { method: 'POST', body: preview.input })
  if (result.requestId !== preview.input.requestId) throw new Error('导入回执标识不一致，请保留旧记录并重试。')
  try {
    getProjectStorage().setItem(IMPORT_MARKER, JSON.stringify({ fingerprint: preview.fingerprint, requestId: result.requestId, confirmed: true }))
  } catch {
    // The server receipt is authoritative; retrying the same import remains safe.
  }
  window.dispatchEvent(new Event('server-workspace-changed'))
  return result
}
