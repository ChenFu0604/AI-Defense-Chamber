import { Router } from 'express'
import { modelSettingsInputSchema, modelListRequestSchema, embeddingSettingsInputSchema } from '@defense/shared'
import type { ModelSettingsService } from '../services/model-settings-service.js'
import { embeddingSettingsService, type EmbeddingSettingsService } from '../services/embedding-settings-service.js'
import { env } from '../config/env.js'
import { AppError } from '../middleware/app-error.js'

export function createSettingsRouter(service: ModelSettingsService, embeddings: EmbeddingSettingsService = embeddingSettingsService) {
  const router = Router()
  router.use(['/settings/model', '/settings/embedding'], (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
      request.socket.remoteAddress ?? '',
    )
    const host = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(request.hostname)
    const origins = new Set([
      env.WEB_ORIGIN,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      request.protocol + '://' + request.get('host'),
    ])
    if (
      !local ||
      !host ||
      request.get('X-Settings-Request') !== '1' ||
      (request.get('origin') && !origins.has(request.get('origin')!))
    )
      throw new AppError(403, 'SETTINGS_ACCESS_DENIED', '模型设置仅允许从本机应用页面访问。')
    next()
  })
  function input(body: unknown) {
    const parsed = modelSettingsInputSchema.safeParse(body)
    if (!parsed.success)
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? '模型配置无效。',
      )
    return parsed.data
  }
  router.get('/settings/model', (_request, response) =>
    response.json({ success: true, data: service.get() }),
  )
  router.put('/settings/model', async (request, response) =>
    response.json({ success: true, data: await service.save(input(request.body)) }),
  )
  router.post('/settings/model/test', async (request, response) => {
    const controller = new AbortController()
    const cancel = () => {
      if (!response.writableEnded) controller.abort()
    }
    response.once('close', cancel)
    try {
      const result = await service.test(input(request.body), controller.signal)
      if (!response.destroyed) response.json({ success: true, data: result })
    } finally {
      response.off('close', cancel)
    }
  })
  router.post('/settings/model/models', async (request, response) => {
    const parsed = modelListRequestSchema.safeParse(request.body)
    if (!parsed.success)
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? '模型列表参数无效。',
      )
    const controller = new AbortController()
    const cancel = () => {
      if (!response.writableEnded) controller.abort()
    }
    response.once('close', cancel)
    try {
      const result = await service.listModels(parsed.data, controller.signal)
      if (!response.destroyed) response.json({ success: true, data: result })
    } finally {
      response.off('close', cancel)
    }
  })
  function embeddingInput(body: unknown) {
    const parsed = embeddingSettingsInputSchema.safeParse(body)
    if (!parsed.success)
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Embedding 配置无效。')
    return parsed.data
  }
  router.get('/settings/embedding', (_request, response) =>
    response.json({ success: true, data: embeddings.get() }),
  )
  router.put('/settings/embedding', async (request, response) =>
    response.json({ success: true, data: await embeddings.save(embeddingInput(request.body)) }),
  )
  router.post('/settings/embedding/test', async (request, response) => {
    const controller = new AbortController()
    const cancel = () => { if (!response.writableEnded) controller.abort() }
    response.once('close', cancel)
    try {
      const result = await embeddings.test(embeddingInput(request.body), controller.signal)
      if (!response.destroyed) response.json({ success: true, data: result })
    } finally { response.off('close', cancel) }
  })
  return router
}
