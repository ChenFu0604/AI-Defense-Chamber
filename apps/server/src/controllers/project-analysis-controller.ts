import type { RequestHandler } from 'express'
import { analyzeProjectRequestSchema } from '../schemas/project-analysis.js'
import type { ProjectAnalysisService } from '../services/project-analysis-service.js'
import { AppError } from '../middleware/app-error.js'

export function createProjectAnalysisController(analyze: ProjectAnalysisService): RequestHandler {
  return async (request, response) => {
    const parsed = analyzeProjectRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        '项目资料或分析模式无效，请检查八项必填资料、项目标识和时间字段后重试。',
      )
    }
    const controller = new AbortController()
    const cancel = () => {
      if (!response.writableEnded) controller.abort()
    }
    response.once('close', cancel)
    try {
      const result = await analyze(parsed.data, controller.signal)
      if (!response.destroyed)
        response.set('Cache-Control', 'no-store').json({ success: true, data: result })
    } finally {
      response.off('close', cancel)
    }
  }
}
