import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import { healthRouter } from './routes/health.js'
import { createProjectsRouter } from './routes/projects.js'
import { analyzeProject, type ProjectAnalysisService } from './services/project-analysis-service.js'
import { errorHandler, notFound } from './middleware/error-handler.js'
import { createJudgesRouter } from './routes/judges.js'
import { askJudge, type JudgeService } from './services/judge-service.js'

export function createApp(
  options: { analyzeProject?: ProjectAnalysisService; askJudge?: JudgeService } = {},
) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: env.WEB_ORIGIN }))
  app.use(express.json({ limit: '256kb' }))
  app.use('/api/v1', healthRouter, createProjectsRouter(options.analyzeProject ?? analyzeProject))
  app.use('/api', healthRouter, createProjectsRouter(options.analyzeProject ?? analyzeProject))
  app.use('/api/v1', createJudgesRouter(options.askJudge ?? askJudge))
  app.use('/api', createJudgesRouter(options.askJudge ?? askJudge))
  app.use(notFound)
  app.use(errorHandler)
  return app
}
export const app = createApp()
