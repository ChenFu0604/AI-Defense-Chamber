import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { savedEmbeddingSettingsSchema } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'

export const embeddingSettingsPath = fileURLToPath(new URL('../../.data/embedding-config.json', import.meta.url))
export function readSavedEmbeddingSettings(path = embeddingSettingsPath) {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (failure) {
    if ((failure as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new AppError(500, 'EMBEDDING_SETTINGS_READ_FAILED', '无法读取后端 Embedding 配置，请检查文件权限。')
  }
  try {
    return savedEmbeddingSettingsSchema.parse(JSON.parse(raw))
  } catch {
    throw new AppError(500, 'EMBEDDING_SETTINGS_CORRUPT', '后端 Embedding 配置损坏，已保留原文件，请修复后重试。')
  }
}
