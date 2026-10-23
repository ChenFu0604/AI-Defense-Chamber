import { Router, type Response } from 'express'
import { knowledgeScopeSchema, knowledgeSearchSchema, knowledgeIndexRequestSchema } from '@defense/shared'
import type { KnowledgeService } from '../services/knowledge-service.js'
import { AppError } from '../middleware/app-error.js'
import type { z } from 'zod'
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '资料参数无效。')
  return parsed.data
}
export function createKnowledgeRouter(service: KnowledgeService) {
  const router = Router()
  async function respond(res: Response, action: (signal: AbortSignal) => Promise<unknown>) {
    const controller = new AbortController()
    const cancel = () => { if (!res.writableEnded) controller.abort() }
    res.once('close', cancel)
    try {
      const data = await action(controller.signal)
      if (!res.destroyed) res.set('Cache-Control','no-store').json({success: true, data})
    } finally { res.off('close', cancel) }
  }
  router.post('/knowledge/library', async (req,res) => res.set('Cache-Control','no-store').json({success: true, data: await service.library(parse(knowledgeScopeSchema, req.body))}))
  router.post('/knowledge/index', async (req,res) => {
    const input = parse(knowledgeIndexRequestSchema, req.body)
    await respond(res, signal => service.index(input, input.attachmentId, input.ocr, signal, input.mode))
  })
  router.post('/knowledge/search', async (req,res) => {
    const input = parse(knowledgeSearchSchema, req.body)
    await respond(res, signal => service.search(input, input.query, signal, false, input.mode))
  })
  router.post('/knowledge/answer', async (req,res) => {
    const input = parse(knowledgeSearchSchema, req.body)
    await respond(res, signal => service.answer(input, input.query, signal, input.mode))
  })
  return router
}
