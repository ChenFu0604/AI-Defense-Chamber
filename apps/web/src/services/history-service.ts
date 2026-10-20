import { historyArchiveSchema, type HistoryArchive } from '@defense/shared'
import {
  readHistory,
  archiveSession,
  archiveReport,
  archiveProject,
  archiveAnalysis,
} from './history-storage'
import { readProjects, getProjectStorage } from './project-storage'
import { HISTORY_KEY } from './history-storage'
import { readAnalysisRecords } from './analysis-storage'
import { recentDefenseSessions } from './defense-storage'
import { defenseApi } from './defense-api'
import { requestReport, ReportApiError } from './report-api'

export function loadHistorySources() {
  const archive = readHistory(),
    warnings: string[] = []
  // Legacy sources stay untouched until an explicit sync/save.
  let projects = archive.projects,
    analyses = archive.analyses
  for (const entry of [...archive.entries].sort(
    (a, b) => Date.parse(b.session.createdAt) - Date.parse(a.session.createdAt),
  )) {
    if (!projects.some((p) => p.id === entry.session.project.id))
      projects = [...projects, entry.session.project]
    if (!analyses.some((a) => a.id === entry.session.analysis.id))
      analyses = [...analyses, entry.session.analysis]
  }
  let legacy: ReturnType<typeof recentDefenseSessions> = []
  try {
    const current = readProjects()
    projects = [...current, ...projects.filter((p) => !current.some((item) => item.id === p.id))]
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : '旧项目读取失败。')
  }
  try {
    const current = readAnalysisRecords()
    analyses = [...current, ...analyses.filter((a) => !current.some((item) => item.id === a.id))]
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : '旧画像读取失败。')
  }
  try {
    legacy = recentDefenseSessions().filter(
      (item) => !archive.entries.some((entry) => entry.session.id === item.id),
    )
  } catch {
    warnings.push('旧版最近会话入口损坏，原数据未覆盖；完整归档仍可查看。')
  }
  return { archive: { ...archive, projects, analyses } as HistoryArchive, legacy, warnings }
}
export async function syncHistoricalSession(id: string) {
  const session = await defenseApi('/' + id)
  archiveSession(session)
  let notice = '已同步会话快照。'
  if (session.status === 'ended' && session.mode === 'live') {
    try {
      archiveReport(await requestReport(id, false))
      notice += '已归档历史报告。'
    } catch (error) {
      if (error instanceof ReportApiError && error.code === 'REPORT_NOT_FOUND')
        notice += '后端尚无评分报告，未触发模型。'
      else throw error
    }
  }
  return notice
}
export function archiveLegacyProjects() {
  for (const project of readProjects()) archiveProject(project)
  for (const analysis of readAnalysisRecords()) archiveAnalysis(analysis)
}
export function downloadHistoryBackup() {
  // Raw export also works for a corrupt/unsupported envelope; never rewrite it to "repair" it.
  const raw =
    getProjectStorage().getItem(HISTORY_KEY) ??
    JSON.stringify(historyArchiveSchema.parse(readHistory()), null, 2)
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'defense-history-backup.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
