import { z } from 'zod'
import {
  MAX_VOICE_OUTPUT_BYTES, MAX_VOICE_UPLOAD_BYTES, voiceTranscriptionResultSchema,
  type VoiceSettingsInput,
} from '@defense/shared'
import { AppError } from '../middleware/app-error.js'
import { modelTransport, modelConnectionHint } from './model-transport.js'
import { validateQwenVoice, validateTtsEndpoint } from './voice-catalog.js'

export function audioKind(bytes: Uint8Array): 'wav' | 'mp3' | 'webm' | 'ogg' | 'mp4' | null {
  const buffer = Buffer.from(bytes)
  if (buffer.length < 12) return null
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WAVE') return 'wav'
  if (buffer.subarray(0, 3).toString() === 'ID3' || (buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0)) return 'mp3'
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm'
  if (buffer.subarray(0, 4).toString() === 'OggS') return 'ogg'
  if (buffer.subarray(4, 8).toString() === 'ftyp') return 'mp4'
  return null
}

export function validateVoiceUpload(bytes: Buffer, contentType: string) {
  const mime = contentType.toLowerCase().split(';')[0]!.trim()
  const expected: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3' }
  if (!bytes.length) throw new AppError(400, 'VOICE_AUDIO_EMPTY', '没有收到录音，请重新录制。')
  if (bytes.length > MAX_VOICE_UPLOAD_BYTES) throw new AppError(413, 'VOICE_AUDIO_TOO_LARGE', '录音超过 10 MB，请缩短后重试。')
  const kind = audioKind(bytes)
  if (!expected[mime] || !kind || expected[mime] !== kind)
    throw new AppError(400, 'VOICE_AUDIO_INVALID', '录音格式不受支持或文件内容与格式不符，请使用 WebM、Ogg、WAV、MP4 或 MP3 音频。')
  return { mime, kind }
}

async function readLimited(response: Response, limit: number, signal?: AbortSignal) {
  if (Number(response.headers.get('content-length') || 0) > limit) {
    await response.body?.cancel().catch(() => undefined)
    throw new AppError(502, 'VOICE_RESPONSE_TOO_LARGE', '语音服务返回内容过大。')
  }
  if (!response.body) throw new AppError(502, 'VOICE_RESPONSE_INVALID', '语音服务没有返回内容。')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  const cancel = () => { void reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  let size = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.byteLength
      if (size > limit) { await reader.cancel(); throw new AppError(502, 'VOICE_RESPONSE_TOO_LARGE', '语音服务返回内容过大。') }
      chunks.push(item.value)
    }
  } finally { signal?.removeEventListener('abort', cancel); reader.releaseLock() }
  return Buffer.concat(chunks)
}

async function readJson(response: Response, signal?: AbortSignal) {
  const bytes = await readLimited(response, 100_000, signal)
  try { return JSON.parse(bytes.toString('utf8')) as unknown }
  catch { throw new AppError(502, 'VOICE_RESPONSE_INVALID', '语音服务返回的内容不是有效 JSON。') }
}

function checkStatus(response: Response) {
  if (response.ok) return
  void response.body?.cancel().catch(() => undefined)
  if ([401, 403].includes(response.status)) throw new AppError(502, 'VOICE_AUTH_FAILED', '语音服务鉴权失败，请检查对应服务的密钥和权限。')
  if (response.status === 429) throw new AppError(503, 'VOICE_RATE_LIMITED', '语音服务额度不足或请求过于频繁，请检查额度后稍后重试。')
  throw new AppError(502, 'VOICE_REQUEST_FAILED', `语音服务请求失败（HTTP ${response.status}），请检查地址、模型和音色兼容性。`)
}

async function withDeadline<T>(timeoutMs: number, external: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>) {
  if (external?.aborted) throw new AppError(499, 'VOICE_CANCELLED', '语音请求已取消。')
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  external?.addEventListener('abort', cancel, { once: true })
  if (external?.aborted) controller.abort()
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  let rejectAbort: ((reason: unknown) => void) | undefined
  const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const onAbort = () => rejectAbort?.(new AppError(timedOut ? 504 : 499, timedOut ? 'VOICE_TIMEOUT' : 'VOICE_CANCELLED', timedOut ? '语音服务响应超时，请稍后重试。' : '语音请求已取消。'))
  controller.signal.addEventListener('abort', onAbort, { once: true })
  try {
    if (controller.signal.aborted) onAbort()
    return await Promise.race([interrupted, operation(controller.signal)])
  } catch (failure) {
    if (failure instanceof AppError) throw failure
    throw new AppError(502, 'VOICE_CONNECTION_FAILED', `无法连接语音服务。${modelConnectionHint(failure)}`)
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', cancel)
    controller.signal.removeEventListener('abort', onAbort)
  }
}

export function createVoiceClient(transport: typeof fetch = modelTransport.fetch) {
  async function audioResponse(response: Response, signal?: AbortSignal) {
    checkStatus(response)
    const mime = response.headers.get('content-type')?.toLowerCase().split(';')[0]?.trim()
    const bytes = await readLimited(response, MAX_VOICE_OUTPUT_BYTES, signal)
    const kind = audioKind(bytes)
    if (!['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(mime || '') || !['wav', 'mp3'].includes(kind || ''))
      throw new AppError(502, 'VOICE_AUDIO_INVALID', '语音服务没有返回可播放的 WAV 或 MP3 音频，无法确认试听成功。')
    return { bytes, contentType: kind === 'wav' ? 'audio/wav' : 'audio/mpeg' }
  }
  return {
    async transcribe(config: VoiceSettingsInput['asr'], bytes: Buffer, contentType: string, signal?: AbortSignal) {
      const validated = validateVoiceUpload(bytes, contentType)
      return withDeadline(config.timeoutMs, signal, async requestSignal => {
        const form = new FormData()
        form.append('model', config.model)
        form.append('file', new Blob([new Uint8Array(bytes)], { type: validated.mime }), `answer.${validated.kind}`)
        form.append('response_format', 'json')
        const response = await transport(`${config.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
          method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form, signal: requestSignal, redirect: 'error',
        })
        checkStatus(response)
        // Providers may add usage/language metadata; normalize only the text into
        // our strict public contract instead of rejecting otherwise valid ASR.
        const parsed = z.object({ text: voiceTranscriptionResultSchema.shape.text }).safeParse(await readJson(response, requestSignal))
        if (!parsed.success) throw new AppError(502, 'VOICE_TRANSCRIPTION_INVALID', '未取得有效转写文字，可能没有识别到语音或服务返回格式不兼容，请缩短录音后重试。')
        return parsed.data
      })
    },
    async speak(config: VoiceSettingsInput['tts'], voice: string, text: string, signal?: AbortSignal) {
      validateQwenVoice(config, voice)
      validateTtsEndpoint(config)
      return withDeadline(config.timeoutMs, signal, async requestSignal => {
        const qwen = config.provider === 'qwen'
        const base = config.baseUrl.replace(/\/+$/, '')
        const url = qwen ? `${base.replace(/\/api\/v1$/, '')}/api/v1/services/audio/tts/SpeechSynthesizer` : `${base}/audio/speech`
        const response = await transport(url, {
          method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, signal: requestSignal, redirect: 'error',
          body: JSON.stringify(qwen ? { model: config.model, input: { text, voice, format: 'wav', sample_rate: 24000 } } : { model: config.model, input: text, voice, response_format: 'wav' }),
        })
        if (!qwen) return audioResponse(response, requestSignal)
        checkStatus(response)
        const parsed = z.object({ output: z.object({ finish_reason: z.literal('stop'), audio: z.object({ url: z.url() }) }) }).safeParse(await readJson(response, requestSignal))
        if (!parsed.success) throw new AppError(502, 'VOICE_RESPONSE_INVALID', 'Qwen 没有返回完整音频地址，请检查模型和接口。')
        const download = new URL(parsed.data.output.audio.url)
        // Never forward credentials or follow a model-controlled redirect. Only the
        // result buckets used by DashScope may be fetched, with HTTPS transport.
        if (download.username || download.password || download.port || download.hash || !/^dashscope-result-[a-z0-9-]+\.oss-(?:cn-[a-z0-9-]+|ap-southeast-1)\.aliyuncs\.com$/i.test(download.hostname) || !['https:', 'http:'].includes(download.protocol))
          throw new AppError(502, 'VOICE_AUDIO_URL_INVALID', 'Qwen 返回了不受信任的音频地址，已停止下载。')
        download.protocol = 'https:'
        return audioResponse(await transport(download, { signal: requestSignal, redirect: 'error' }), requestSignal)
      })
    },
  }
}
