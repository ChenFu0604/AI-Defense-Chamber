import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import { healthRouter } from './routes/health.js'
import { createProjectsRouter } from './routes/projects.js'
import { analyzeProject, type ProjectAnalysisService } from './services/project-analysis-service.js'
import { errorHandler, notFound } from './middleware/error-handler.js'

export function createApp(options: { analyzeProject?: ProjectAnalysisService } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: env.WEB_ORIGIN }))
  app.use(express.json({ limit: '256kb' }))
  app.use('/api/v1', healthRouter, createProjectsRouter(options.analyzeProject ?? analyzeProject))
  app.use('/api', healthRouter, createProjectsRouter(options.analyzeProject ?? analyzeProject))
  app.use(notFound)
  app.use(errorHandler)
  return app
}
export const app = createApp()
