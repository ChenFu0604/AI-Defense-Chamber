import { Router } from 'express'
import { z } from 'zod'
import type { ReportService } from '../services/report-service.js'
import { AppError } from '../middleware/app-error.js'

export function createReportsRouter(service: ReportService) {
  const router = Router()
  router.use('/defense/sessions/:id/report', (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (!z.uuid().safeParse(request.params.id).success)
      throw new AppError(400, 'VALIDATION_ERROR', '会话 ID 无效。')
    next()
  })
  router.post('/defense/sessions/:id/report', async (request, response) => {
    const report = await service.generate(request.params.id!)
    if (!response.destroyed) response.json({ success: true, data: report })
  })
  router.get('/defense/sessions/:id/report', async (request, response) =>
    response.json({ success: true, data: await service.get(request.params.id!) }),
  )
  return router
}
