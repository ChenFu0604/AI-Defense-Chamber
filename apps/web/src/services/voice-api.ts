import {
  MAX_VOICE_OUTPUT_BYTES, MAX_VOICE_UPLOAD_BYTES, MODEL_REQUEST_TIMEOUT_MS,
  VOICE_AUDIO_MIME_TYPES, apiErrorResponseSchema, voiceCatalogResponseSchema,
  voicePreviewRequestSchema, voiceSettingsInputSchema, voiceSettingsResponseSchema,
  voiceSpeechRequestSchema, voiceTranscriptionResponseSchema,
  type VoiceSettingsInput, type VoicePreviewRequest, type VoiceSpeechRequest,
} from '@defense/shared'

async function request<T>(path: string, options: RequestInit, parse: (response: Response) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', cancel, {once: true})
  const timeout = setTimeout(cancel, MODEL_REQUEST_TIMEOUT_MS)
  try {
    controller.signal.throwIfAborted()
    const response = await fetch('/api/v1' + path, {...options, signal: controller.signal})
    if (!response.ok) {
      let raw: unknown
      try { raw = await response.json() } catch { throw new Error('语音服务请求失败，请检查后端和服务配置。') }
      const failure = apiErrorResponseSchema.safeParse(raw)
      throw new Error(failure.success ? failure.data.error.message : '语音服务请求失败，请重试。')
    }
    return await parse(response)
  } catch (failure) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? '本次语音请求已取消。' : '语音请求超时，请检查服务或缩短录音后重试。')
    if (failure instanceof TypeError) throw new Error('无法连接语音后端，请检查服务是否已启动。')
    throw failure
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}
async function json(response: Response): Promise<unknown> {
  try { return await response.json() } catch { throw new Error('语音接口返回格式异常，请确认后端已更新。') }
}
async function audio(response: Response): Promise<Blob> {
  const mime = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (!['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(mime)) throw new Error('语音服务未返回有效音频，无法播放。')
  if (Number(response.headers.get('content-length')) > MAX_VOICE_OUTPUT_BYTES) throw new Error('返回音频过大，请缩短朗读内容。')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('语音服务返回了空音频。')
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_VOICE_OUTPUT_BYTES) {
        await reader.cancel()
        throw new Error('返回音频过大，请缩短朗读内容。')
      }
      chunks.push(new Uint8Array(chunk.value))
    }
  } finally { reader.releaseLock() }
  if (!size) throw new Error('语音服务返回了空音频。')
  return new Blob(chunks, {type: mime})
}
const settingsHeaders = {'X-Settings-Request': '1', 'Content-Type': 'application/json'}
export async function getVoiceSettings(signal?: AbortSignal) {
  return request('/settings/voice', {method: 'GET', headers: {'X-Settings-Request': '1'}}, async response => {
    const parsed = voiceSettingsResponseSchema.safeParse(await json(response))
    if (!parsed.success) throw new Error('后端语音配置格式异常，未接受该结果。')
    return parsed.data.data
  }, signal)
}
export async function saveVoiceSettings(input: VoiceSettingsInput, signal?: AbortSignal) {
  const body = JSON.stringify(voiceSettingsInputSchema.parse(input))
  return request('/settings/voice', {method: 'PUT', headers: settingsHeaders, body}, async response => {
    const parsed = voiceSettingsResponseSchema.safeParse(await json(response))
    if (!parsed.success) throw new Error('未能确认语音配置保存结果，请重新读取后端配置。')
    return parsed.data.data
  }, signal)
}
export async function listVoiceCatalog(input: VoiceSettingsInput, signal?: AbortSignal) {
  const body = JSON.stringify(voiceSettingsInputSchema.parse(input))
  return request('/settings/voice/voices', {method: 'POST', headers: settingsHeaders, body}, async response => {
    const parsed = voiceCatalogResponseSchema.safeParse(await json(response))
    if (!parsed.success) throw new Error('音色目录格式异常，可重试或手动填写音色 ID。')
    if (parsed.data.data.provider !== input.tts.provider || parsed.data.data.model !== input.tts.model) throw new Error('音色目录与当前模型不匹配，请重新获取。')
    return parsed.data.data
  }, signal)
}
export async function previewVoiceAudio(input: VoicePreviewRequest, signal?: AbortSignal) {
  const body = JSON.stringify(voicePreviewRequestSchema.parse(input))
  return request('/settings/voice/preview', {method: 'POST', headers: settingsHeaders, body}, audio, signal)
}
export async function transcribeVoice(recording: Blob, signal?: AbortSignal): Promise<{text: string}> {
  const mime = recording.type.split(';')[0]!.trim().toLowerCase()
  if (!(VOICE_AUDIO_MIME_TYPES as readonly string[]).includes(mime)) return Promise.reject(new Error('录音格式不受支持，请使用支持 WebM、Ogg、WAV 或 MP4 录音的浏览器。'))
  if (!recording.size) return Promise.reject(new Error('录音为空，请重新录制。'))
  if (recording.size > MAX_VOICE_UPLOAD_BYTES) return Promise.reject(new Error('录音超过 10 MB，请缩短后重试。'))
  return request('/voice/transcriptions', {method: 'POST', headers: {'X-Voice-Request': '1', 'Content-Type': recording.type}, body: recording}, async response => {
    const parsed = voiceTranscriptionResponseSchema.safeParse(await json(response))
    if (!parsed.success) throw new Error('语音转写结果无效，请重试；原有输入已保留。')
    return parsed.data.data
  }, signal)
}
export async function synthesizeVoice(input: VoiceSpeechRequest, signal?: AbortSignal): Promise<Blob> {
  const body = JSON.stringify(voiceSpeechRequestSchema.parse(input))
  return request('/voice/speech', {method: 'POST', headers: {'X-Voice-Request': '1', 'Content-Type': 'application/json'}, body}, audio, signal)
}
