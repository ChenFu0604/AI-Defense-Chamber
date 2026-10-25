import { mkdir, writeFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  defaultVoiceSettings, voiceSettingsInputSchema, savedVoiceSettingsSchema, publicVoiceSettingsSchema,
  judgeIds, type VoiceSettingsInput, type JudgeId, type VoiceSpeechRequest,
} from '@defense/shared'
import { voiceSettingsPath, readSavedVoiceSettings } from '../config/voice-settings-file.js'
import { AppError } from '../middleware/app-error.js'
import { createVoiceClient } from './voice-client.js'
import { getVoiceCatalog, validateQwenVoice, validateTtsEndpoint } from './voice-catalog.js'

const previewTexts: Record<JudgeId, string> = {
  business: '先不用急着讲技术。谁最需要这个产品？你准备怎么找到第一批用户？',
  technical: '我们先看最关键的一步。这个功能你准备怎么实现？遇到问题时，有没有备用办法？',
  user: '假设我第一次打开你的产品，我会先做什么？你可以用一个具体例子说说。',
  devil: '如果这个假设不成立，项目还做得下去吗？你准备拿什么证据来验证它？',
}

export function createVoiceService(options: { path?: string; transport?: typeof fetch } = {}) {
  const path = options.path ?? voiceSettingsPath
  const client = createVoiceClient(options.transport)
  let saving = false
  function current() {
    const saved = readSavedVoiceSettings(path)
    return { saved, config: saved?.config ?? structuredClone(defaultVoiceSettings) }
  }
  function get() {
    const { saved, config } = current()
    const endpoint = ({ apiKey, ...value }: VoiceSettingsInput['asr']) => ({ ...value, hasApiKey: Boolean(apiKey) })
    return publicVoiceSettingsSchema.parse({
      enabled: config.enabled, asr: endpoint(config.asr), tts: { ...endpoint(config.tts), provider: config.tts.provider },
      judges: config.judges, source: saved ? 'saved' : 'default', updatedAt: saved?.updatedAt ?? null,
      status: !config.enabled ? 'not_configured' : config.asr.apiKey && config.tts.apiKey ? 'configured' : 'configuration_error',
    })
  }
  function resolve(input: VoiceSettingsInput, requirement: 'all' | 'tts' | 'none' = 'all') {
    const parsed = voiceSettingsInputSchema.safeParse(input)
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '语音配置不完整。')
    const previous = current().config, next = parsed.data
    for (const key of ['asr', 'tts'] as const) {
      const value = next[key], prior = previous[key]
      value.baseUrl = value.baseUrl.replace(/\/+$/, '')
      const same = value.baseUrl === prior.baseUrl.replace(/\/+$/, '') && (key !== 'tts' || next.tts.provider === previous.tts.provider)
      const required = requirement === 'tts' ? key === 'tts' : requirement === 'all' && next.enabled
      if (!value.apiKey && !same && prior.apiKey && required)
        throw new AppError(400, 'VOICE_API_KEY_REQUIRED', '更换语音 API 地址或供应商时，请重新输入对应密钥，原密钥不会自动转发。')
      value.apiKey ||= same ? prior.apiKey : ''
      if (required && !value.apiKey) throw new AppError(400, 'VOICE_API_KEY_REQUIRED', `请填写${key === 'asr' ? '语音识别' : '语音合成'}服务的 API 密钥；不会复用聊天模型密钥。`)
    }
    if ((requirement === 'all' && next.enabled) || requirement === 'tts') validateTtsEndpoint(next.tts)
    if (requirement === 'all' && next.enabled) for (const judgeId of judgeIds) validateQwenVoice(next.tts, next.judges[judgeId])
    return next
  }
  function runtime() {
    const config = current().config
    if (!config.enabled) throw new AppError(503, 'VOICE_DISABLED', '语音功能尚未启用，请前往系统设置配置独立的识别与合成服务。')
    return resolve(config)
  }
  return {
    get,
    async save(input: VoiceSettingsInput) {
      if (saving) throw new AppError(409, 'VOICE_SETTINGS_BUSY', '语音配置正在保存，请稍后重试。')
      saving = true
      const temporary = `${path}.${randomUUID()}.tmp`
      try {
        const record = savedVoiceSettingsSchema.parse({ version: 1, updatedAt: new Date().toISOString(), config: resolve(input) })
        await mkdir(dirname(path), { recursive: true })
        await writeFile(temporary, JSON.stringify(record), { flag: 'wx', encoding: 'utf8', mode: 0o600 })
        await rename(temporary, path)
        const confirmed = readSavedVoiceSettings(path)
        if (!confirmed || JSON.stringify(confirmed) !== JSON.stringify(record)) throw new Error('Unconfirmed voice configuration')
        return get()
      } catch (failure) {
        if (failure instanceof AppError) throw failure
        throw new AppError(500, 'VOICE_SETTINGS_SAVE_FAILED', '语音配置保存失败，未确认保存成功，请检查后端磁盘和文件权限。')
      } finally { saving = false; await unlink(temporary).catch(() => undefined) }
    },
    voices(input: VoiceSettingsInput) {
      const parsed = voiceSettingsInputSchema.safeParse(input)
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', '请填写有效的语音配置。')
      return getVoiceCatalog(parsed.data.tts)
    },
    async preview(input: VoiceSettingsInput, judgeId: JudgeId, signal?: AbortSignal) {
      const config = resolve(input, 'tts')
      return client.speak(config.tts, config.judges[judgeId], previewTexts[judgeId], signal)
    },
    async transcribe(bytes: Buffer, contentType: string, signal?: AbortSignal) {
      return client.transcribe(runtime().asr, bytes, contentType, signal)
    },
    async speak(input: VoiceSpeechRequest, signal?: AbortSignal) {
      const config = runtime()
      return client.speak(config.tts, config.judges[input.judgeId], input.text, signal)
    },
  }
}
export type VoiceService = ReturnType<typeof createVoiceService>
export const voiceService = createVoiceService()
