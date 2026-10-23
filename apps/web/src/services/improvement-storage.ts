import { improvementCollectionSchema, improvementUpdateSchema, createImprovementTask, type DefenseReport, type ImprovementTask, type ImprovementUpdate } from '@defense/shared'
import { getProjectStorage, type ProjectStorage } from './project-storage'

export const IMPROVEMENT_STORAGE_KEY = 'defense-chamber.improvements.v1'
const MAX_BYTES = 1024 * 1024
export function readImprovementTasks(storage: ProjectStorage = getProjectStorage()): ImprovementTask[] {
  let raw: string | null
  try { raw = storage.getItem(IMPROVEMENT_STORAGE_KEY) }
  catch { throw new Error('无法读取改进任务，请检查浏览器存储权限。') }
  if (raw === null) return []
  const parsed = improvementCollectionSchema.safeParse((() => { try { return JSON.parse(raw) } catch { return null } })())
  if (!parsed.success) throw new Error('改进任务数据损坏或版本不兼容，原数据未覆盖。请先备份恢复。')
  return parsed.data.tasks
}
function save(tasks: ImprovementTask[], storage: ProjectStorage) {
  const payload = JSON.stringify(improvementCollectionSchema.parse({version: 1, tasks}))
  if (payload.length * 2 > MAX_BYTES) throw new Error('改进任务达到 1 MiB 上限，请先备份任务资料。')
  try {
    storage.setItem(IMPROVEMENT_STORAGE_KEY, payload)
    if (storage.getItem(IMPROVEMENT_STORAGE_KEY) !== payload) throw new Error('Read-back mismatch')
  } catch { throw new Error('无法确认改进任务已保存，可能存储空间不足。输入已保留，请检查后重试。') }
}
export function addImprovementTask(report: DefenseReport, index: number, projectName: string, storage: ProjectStorage = getProjectStorage()) {
  const tasks = readImprovementTasks(storage)
  const existing = tasks.find(t => t.sourceReportId === report.id && t.improvementIndex === index)
  if (existing) return tasks
  const task = createImprovementTask(report, index, projectName, crypto.randomUUID(), new Date().toISOString())
  const next = [task, ...tasks]
  save(next, storage)
  return next
}
export function updateImprovementTask(base: ImprovementTask, update: ImprovementUpdate, storage: ProjectStorage = getProjectStorage()) {
  const tasks = readImprovementTasks(storage), current = tasks.find(t => t.id === base.id)
  if (!current) throw new Error('任务不存在，请刷新任务列表。')
  const parsed = improvementUpdateSchema.parse(update)
  // A previous write may have succeeded even when its read-back failed.
  if (current.status === parsed.status && current.note === parsed.note &&
    JSON.stringify(current.attachments ?? []) === JSON.stringify(parsed.attachments ?? [])) return tasks
  if (JSON.stringify(current) !== JSON.stringify(base)) throw new Error('任务已在其他页面更新，未覆盖新记录。请先核对；本页输入仍保留。')
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString()
  const next = tasks.map(t => t.id === current.id ? {...current, ...parsed, updatedAt} : t)
  save(next, storage)
  return next
}
export function downloadImprovementBackup() {
  const raw = getProjectStorage().getItem(IMPROVEMENT_STORAGE_KEY) ?? JSON.stringify({version: 1, tasks: []})
  const url = URL.createObjectURL(new Blob([raw], {type: 'application/json'}))
  const link = document.createElement('a')
  link.href = url; link.download = 'defense-improvement-tasks.json'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
