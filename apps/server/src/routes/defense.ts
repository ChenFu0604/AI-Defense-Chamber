import { Router } from 'express'
import { z } from 'zod'
import {
  createDefenseRequestSchema,
  answerRequestSchema,
  switchJudgeRequestSchema,
  initialQuestionRequestSchema,
  retrainRequestSchema,
} from '@defense/shared'
import type { DefenseService } from '../services/defense-service.js'
import { AppError } from '../middleware/app-error.js'
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success)
    throw new AppError(400, 'VALIDATION_ERROR', result.error.issues[0]?.message ?? '会话参数无效。')
  return result.data
}
export function createDefenseRouter(service: DefenseService) {
  const router = Router()
  router.use('/defense/sessions/:id', (request, _response, next) => {
    parse(z.uuid(), request.params.id)
    next()
  })
  router.post('/defense/sessions', async (request, response) => {
    const session = await service.create(parse(createDefenseRequestSchema, request.body))
    response.set('Cache-Control', 'no-store').status(201).json({ success: true, data: session })
  })
  router.post('/defense/sessions/:id/retrain', async (request, response) => {
    response
      .set('Cache-Control', 'no-store')
      .status(201)
      .json({
        success: true,
        data: await service.retrain(request.params.id!, parse(retrainRequestSchema, request.body)),
      })
  })
  router.get('/defense/sessions/:id', async (request, response) => {
    response
      .set('Cache-Control', 'no-store')
      .json({ success: true, data: await service.get(request.params.id!) })
  })
  router.post('/defense/sessions/:id/question', async (request, response) => {
    response.set('Cache-Control', 'no-store').json({
      success: true,
      data: await service.initial(
        request.params.id!,
        parse(initialQuestionRequestSchema, request.body).requestId,
      ),
    })
  })
  router.post('/defense/sessions/:id/answer', async (request, response) => {
    response.set('Cache-Control', 'no-store').json({
      success: true,
      data: await service.answer(request.params.id!, parse(answerRequestSchema, request.body)),
    })
  })
  router.post('/defense/sessions/:id/judge', async (request, response) => {
    response.set('Cache-Control', 'no-store').json({
      success: true,
      data: await service.switchJudge(
        request.params.id!,
        parse(switchJudgeRequestSchema, request.body),
      ),
    })
  })
  router.post('/defense/sessions/:id/end', async (request, response) => {
    response
      .set('Cache-Control', 'no-store')
      .json({ success: true, data: await service.end(request.params.id!) })
  })
  return router
}
