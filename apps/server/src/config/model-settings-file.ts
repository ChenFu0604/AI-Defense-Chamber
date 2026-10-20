import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { savedModelSettingsSchema } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'

export const modelSettingsPath = fileURLToPath(
  new URL('../../.data/model-config.json', import.meta.url),
)
export function readSavedModelSettings(path = modelSettingsPath) {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (failure) {
    if ((failure as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new AppError(500, 'MODEL_SETTINGS_READ_FAILED', '无法读取后端模型配置，请检查文件权限。')
  }
  try {
    return savedModelSettingsSchema.parse(JSON.parse(raw))
  } catch {
    throw new AppError(
      500,
      'MODEL_SETTINGS_CORRUPT',
      '后端模型配置文件损坏，已保留原文件，请修复后重试。',
    )
  }
}
