import { serverHistoryResponseSchema, type ServerHistory } from '@defense/shared'
import { defenseApi } from './defense-api'
import { requestReport, ReportApiError } from './report-api'
import { serverRequest } from './server-api'

export async function loadHistorySources(signal?: AbortSignal) {
  const archive = await serverRequest('/history', serverHistoryResponseSchema, { signal })
  return { archive, legacy: [] as { id: string; name: string; mode: string }[], warnings: [] as string[] }
}
export async function syncHistoricalSession(id: string) {
  const session = await defenseApi('/' + id)
  let notice = '已读取服务端会话记录。'
  if (session.status === 'ended' && session.mode === 'live') {
    try {
      await requestReport(id, false)
      notice += '已读取原评分报告。'
    } catch (error) {
      if (error instanceof ReportApiError && error.code === 'REPORT_NOT_FOUND')
        notice += '尚无评分报告，未触发模型。'
      else throw error
    }
  }
  return notice
}
export function downloadJsonSnapshot(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function downloadHistoryBackup(): Promise<ServerHistory> {
  const { archive } = await loadHistorySources()
  downloadJsonSnapshot(archive, 'defense-history-backup.json')
  return archive
}
