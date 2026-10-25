import { z } from 'zod'
import { judgeIds } from './judges.js'
import { modelApiKeySchema, modelBaseUrlSchema, modelTimeoutSchema } from './settings.js'

export const MAX_VOICE_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_VOICE_OUTPUT_BYTES = 20 * 1024 * 1024
export const MAX_VOICE_RECORDING_SECONDS = 120
export const VOICE_AUDIO_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/mpeg'] as const
const endpointSchema = z.strictObject({
  baseUrl: modelBaseUrlSchema,
  model: z.string().trim().min(1, '请填写语音模型名称。').max(200),
  apiKey: modelApiKeySchema.default(''),
  timeoutMs: modelTimeoutSchema,
})
export const judgeVoiceAssignmentsSchema = z.strictObject({
  business: z.string().trim().min(1).max(100), technical: z.string().trim().min(1).max(100),
  user: z.string().trim().min(1).max(100), devil: z.string().trim().min(1).max(100),
})
export const voiceSettingsInputSchema = z.strictObject({
  enabled: z.boolean(),
  asr: endpointSchema,
  tts: endpointSchema.extend({ provider: z.enum(['qwen', 'openai_compatible']) }),
  judges: judgeVoiceAssignmentsSchema,
})
export type VoiceSettingsInput = z.infer<typeof voiceSettingsInputSchema>
export const savedVoiceSettingsSchema = z.strictObject({
  version: z.literal(1), updatedAt: z.iso.datetime(), config: voiceSettingsInputSchema,
})
const publicEndpointSchema = endpointSchema.omit({ apiKey: true }).extend({ hasApiKey: z.boolean() })
export const publicVoiceSettingsSchema = z.strictObject({
  enabled: z.boolean(), asr: publicEndpointSchema,
  tts: publicEndpointSchema.extend({ provider: z.enum(['qwen', 'openai_compatible']) }),
  judges: judgeVoiceAssignmentsSchema,
  source: z.enum(['saved', 'default']), status: z.enum(['configured', 'not_configured', 'configuration_error']),
  updatedAt: z.iso.datetime().nullable(),
})
export type PublicVoiceSettings = z.infer<typeof publicVoiceSettingsSchema>
export const voiceSettingsResponseSchema = z.strictObject({ success: z.literal(true), data: publicVoiceSettingsSchema })
export const voiceCatalogItemSchema = z.strictObject({
  id: z.string().min(1).max(100), name: z.string().min(1).max(100), description: z.string().min(1).max(300),
  languages: z.array(z.string().min(1)).min(1).max(30),
})
export const voiceCatalogSchema = z.strictObject({
  source: z.literal('builtin'), provider: z.enum(['qwen', 'openai_compatible']), model: z.string().min(1),
  docsUrl: z.url(), notice: z.string().min(1), voices: z.array(voiceCatalogItemSchema).max(200),
})
export type VoiceCatalog = z.infer<typeof voiceCatalogSchema>
export const voiceCatalogResponseSchema = z.strictObject({ success: z.literal(true), data: voiceCatalogSchema })
export const voicePreviewRequestSchema = z.strictObject({ settings: voiceSettingsInputSchema, judgeId: z.enum(judgeIds) })
export type VoicePreviewRequest = z.infer<typeof voicePreviewRequestSchema>
export const voiceSpeechRequestSchema = z.strictObject({ judgeId: z.enum(judgeIds), text: z.string().trim().min(1, '没有可朗读的问题。').max(2000, '朗读文本不能超过 2000 字。') })
export type VoiceSpeechRequest = z.infer<typeof voiceSpeechRequestSchema>
export const voiceTranscriptionResultSchema = z.strictObject({ text: z.string().trim().min(1, '未识别到有效语音，请重试。').max(4000, '转写结果超过回答长度，请缩短录音。') })
export const voiceTranscriptionResponseSchema = z.strictObject({ success: z.literal(true), data: voiceTranscriptionResultSchema })

export const defaultVoiceSettings: VoiceSettingsInput = {
  enabled: false,
  asr: { baseUrl: 'https://api.openai.com/v1', model: 'whisper-1', apiKey: '', timeoutMs: 120000 },
  tts: { provider: 'qwen', baseUrl: 'https://YOUR_WORKSPACE_ID.cn-beijing.maas.aliyuncs.com/api/v1', model: 'qwen-audio-3.1-tts-flash', apiKey: '', timeoutMs: 120000 },
  judges: { business: 'xunanchuan_v3.1', technical: 'anmingyuan_v3.1', user: 'longanhuan_v3.1', devil: 'xuyanchu_v3.1' },
}
