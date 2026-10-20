import {
  analysisCollectionSchema,
  analysisRecordSchema,
  type AnalysisRecord,
} from '@defense/shared'
import { getProjectStorage, type ProjectStorage } from './project-storage'

export const ANALYSIS_STORAGE_KEY = 'defense-chamber.analyses.v1'
export function readAnalysisRecords(
  storage: ProjectStorage = getProjectStorage(),
): AnalysisRecord[] {
  let raw: string | null
  try {
    raw = storage.getItem(ANALYSIS_STORAGE_KEY)
  } catch {
    throw new Error('无法读取本地画像。已有记录未被覆盖，请检查浏览器存储权限。')
  }
  if (raw === null) return []
  try {
    return analysisCollectionSchema.parse(JSON.parse(raw)).records
  } catch {
    throw new Error('本地画像记录损坏或版本不兼容。已有记录未被覆盖，请先备份或恢复记录。')
  }
}
export function saveAnalysisRecord(
  input: AnalysisRecord,
  storage: ProjectStorage = getProjectStorage(),
): void {
  const record = analysisRecordSchema.parse(input)
  const existing = readAnalysisRecords(storage)
  const records = [
    record,
    ...existing.filter((item) => item.projectId !== record.projectId || item.mode !== record.mode),
  ]
  const payload = JSON.stringify(analysisCollectionSchema.parse({ version: 1, records }))
  try {
    storage.setItem(ANALYSIS_STORAGE_KEY, payload)
    if (storage.getItem(ANALYSIS_STORAGE_KEY) !== payload) throw new Error('Unconfirmed')
  } catch {
    throw new Error(
      '画像已生成，但无法确认已保存到浏览器。当前结果仍可查看，刷新后可能丢失，请检查存储权限或剩余空间。',
    )
  }
}
