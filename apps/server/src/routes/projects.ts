import { Router } from 'express'
import { createProjectAnalysisController } from '../controllers/project-analysis-controller.js'
import type { ProjectAnalysisService } from '../services/project-analysis-service.js'

export function createProjectsRouter(analyze: ProjectAnalysisService) {
  const router = Router()
  router.post('/projects/analyze', createProjectAnalysisController(analyze))
  return router
}
