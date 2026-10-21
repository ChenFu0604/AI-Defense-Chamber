import { z } from 'zod'
import { projectDraftSchema, type ProjectDraft } from '@defense/shared'
import { getProjectStorage, type ProjectStorage } from './project-storage'

export const PROJECT_DRAFTS_KEY = 'defense-chamber.project-drafts.v1'
const schema = z.strictObject({ version: z.literal(1), drafts: z.array(projectDraftSchema) })
  .refine((v) => new Set(v.drafts.map((d) => d.key)).size === v.drafts.length)

export function readProjectDrafts(storage: ProjectStorage = getProjectStorage()): ProjectDraft[] {
  try {
    const raw = storage.getItem(PROJECT_DRAFTS_KEY)
    return raw === null ? [] : schema.parse(JSON.parse(raw)).drafts
  } catch {
    throw new Error('项目草稿无法读取或已损坏，原数据已保留；请先备份后再恢复。')
  }
}

function write(drafts: ProjectDraft[], storage: ProjectStorage) {
  const payload = JSON.stringify(schema.parse({ version: 1, drafts }))
  if (payload.length * 2 > 1024 * 1024) throw new Error('草稿达到 1 MiB 上限，输入仍在本页，请先完成或备份草稿。')
  try {
    storage.setItem(PROJECT_DRAFTS_KEY, payload)
    if (storage.getItem(PROJECT_DRAFTS_KEY) !== payload) throw new Error('unconfirmed')
  } catch {
    throw new Error('无法确认草稿已保存，输入仍在本页，请检查存储空间或权限后重试。')
  }
}

export function saveProjectDraft(draft: ProjectDraft, storage: ProjectStorage = getProjectStorage()) {
  const parsed = projectDraftSchema.parse(draft)
  const drafts = readProjectDrafts(storage)
  write([parsed, ...drafts.filter((v) => v.key !== parsed.key)], storage)
}

export function removeProjectDraft(key: string, storage: ProjectStorage = getProjectStorage()) {
  write(readProjectDrafts(storage).filter((v) => v.key !== key), storage)
}
