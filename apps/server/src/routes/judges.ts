import { Router } from 'express'
import { judgeQuestionRequestSchema } from '@defense/shared'
import type { JudgeService } from '../services/judge-service.js'
import { AppError } from '../middleware/app-error.js'

export function createJudgesRouter(ask: JudgeService) {
  const router = Router()
  router.post('/judges/question', async (request, response) => {
    const parsed = judgeQuestionRequestSchema.safeParse(request.body)
    if (!parsed.success)
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? '提问参数无效。',
      )
    const controller = new AbortController()
    const cancel = () => {
      if (!response.writableEnded) controller.abort()
    }
    response.once('close', cancel)
    try {
      const result = await ask(parsed.data, controller.signal)
      if (!response.destroyed)
        response.set('Cache-Control', 'no-store').json({ success: true, data: result })
    } finally {
      response.off('close', cancel)
    }
  })
  return router
}
