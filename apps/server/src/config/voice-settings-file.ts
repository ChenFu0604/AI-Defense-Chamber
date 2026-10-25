import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { savedVoiceSettingsSchema } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'

export const voiceSettingsPath = fileURLToPath(new URL('../../.data/voice-config.json', import.meta.url))
export function readSavedVoiceSettings(path = voiceSettingsPath) {
  let raw: string
  try { raw = readFileSync(path, 'utf8') }
  catch (failure) {
    if ((failure as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new AppError(500, 'VOICE_SETTINGS_READ_FAILED', '无法读取语音配置，请检查后端文件权限。')
  }
  try { return savedVoiceSettingsSchema.parse(JSON.parse(raw)) }
  catch { throw new AppError(500, 'VOICE_SETTINGS_CORRUPT', '语音配置文件损坏，已保留原文件，请修复后重试。') }
}
