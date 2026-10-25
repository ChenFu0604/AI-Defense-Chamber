import { Router, raw, type Request, type Response, type RequestHandler } from 'express'
import {
  MAX_VOICE_UPLOAD_BYTES, voiceSettingsInputSchema, voicePreviewRequestSchema, voiceSpeechRequestSchema,
} from '@defense/shared'
import { env } from '../config/env.js'
import { AppError } from '../middleware/app-error.js'
import { validateVoiceUpload } from '../services/voice-client.js'
import type { VoiceService } from '../services/voice-service.js'

function localAccess(header: 'X-Voice-Request' | 'X-Settings-Request'): RequestHandler {
  return (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
    const host = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(request.hostname)
    const origins = new Set([env.WEB_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173', `${request.protocol}://${request.get('host')}`])
    if (!local || !host || request.get(header) !== '1' || (request.get('origin') && !origins.has(request.get('origin')!)))
      throw new AppError(403, 'VOICE_ACCESS_DENIED', '语音接口仅允许从本机应用页面访问。')
    next()
  }
}
async function cancellable<T>(request: Request, response: Response, work: (signal: AbortSignal) => Promise<T>, send: (data: T) => void) {
  const controller = new AbortController()
  const cancel = () => { if (!response.writableEnded) controller.abort() }
  response.once('close', cancel)
  if (request.aborted || response.destroyed) controller.abort()
  try { const result = await work(controller.signal); if (!response.destroyed) send(result) }
  finally { response.off('close', cancel) }
}
export function createVoiceRouter(service: VoiceService) {
  const router = Router()
  router.use('/settings/voice', localAccess('X-Settings-Request'))
  router.use('/voice', localAccess('X-Voice-Request'))
  router.get('/settings/voice', (_request, response) => response.json({ success: true, data: service.get() }))
  router.put('/settings/voice', async (request, response) => {
    const parsed = voiceSettingsInputSchema.safeParse(request.body)
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '语音配置无效。')
    response.json({ success: true, data: await service.save(parsed.data) })
  })
  router.post('/settings/voice/voices', (request, response) => {
    const parsed = voiceSettingsInputSchema.safeParse(request.body)
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', '请填写有效语音配置。')
    response.json({ success: true, data: service.voices(parsed.data) })
  })
  router.post('/settings/voice/preview', async (request, response) => {
    const parsed = voicePreviewRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '试听参数无效。')
    await cancellable(request, response, signal => service.preview(parsed.data.settings, parsed.data.judgeId, signal), result => response.type(result.contentType).send(result.bytes))
  })
  router.post('/voice/transcriptions', raw({ type: () => true, limit: MAX_VOICE_UPLOAD_BYTES }), async (request, response) => {
    if (!Buffer.isBuffer(request.body)) throw new AppError(400, 'VOICE_AUDIO_INVALID', '请直接上传录音二进制内容。')
    const contentType = request.get('content-type') ?? ''
    validateVoiceUpload(request.body, contentType)
    await cancellable(request, response, signal => service.transcribe(request.body as Buffer, contentType, signal), result => response.json({ success: true, data: result }))
  })
  router.post('/voice/speech', async (request, response) => {
    const parsed = voiceSpeechRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '朗读参数无效。')
    await cancellable(request, response, signal => service.speak(parsed.data, signal), result => response.type(result.contentType).send(result.bytes))
  })
  return router
}
