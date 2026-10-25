import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import { healthRouter } from './routes/health.js'
import { createProjectsRouter } from './routes/projects.js'
import { analyzeProject, type ProjectAnalysisService } from './services/project-analysis-service.js'
import { errorHandler, notFound } from './middleware/error-handler.js'
import { createJudgesRouter } from './routes/judges.js'
import { askJudge, type JudgeService } from './services/judge-service.js'
import { createDefenseRouter } from './routes/defense.js'
import { createDefenseService, defenseService, type DefenseService } from './services/defense-service.js'
import { createSettingsRouter } from './routes/settings.js'
import { createReportsRouter } from './routes/reports.js'
import { createAttachmentsRouter } from './routes/attachments.js'
import { createKnowledgeRouter } from './routes/knowledge.js'
import { knowledgeFor, type KnowledgeService } from './services/knowledge-service.js'
import { attachmentService, type AttachmentService } from './services/attachment-service.js'
import { createReportService, type ReportService } from './services/report-service.js'
import {
  modelSettingsService,
  type ModelSettingsService,
} from './services/model-settings-service.js'
import { embeddingSettingsService, type EmbeddingSettingsService } from './services/embedding-settings-service.js'
import { voiceService, type VoiceService } from './services/voice-service.js'
import { createVoiceRouter } from './routes/voice.js'
import { createSqliteDefenseRepository, createSqliteReportRepository, workspaceDatabase, type WorkspaceDatabase } from './storage/database.js'
import { authoritativeDefense, createWorkspaceRouter, persistedProjectAnalysis } from './routes/workspace.js'

export function createApp(
  options: {
    analyzeProject?: ProjectAnalysisService
    askJudge?: JudgeService
    defense?: DefenseService
    modelSettings?: ModelSettingsService
    embeddingSettings?: EmbeddingSettingsService
    voice?: VoiceService
    reports?: ReportService
    attachments?: AttachmentService
    knowledge?: KnowledgeService
    // Explicit opt-out is reserved for isolated adapters/tests. Other injected
    // services must not implicitly disable server-authoritative persistence.
    workspace?: WorkspaceDatabase | false
  } = {},
) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: env.WEB_ORIGIN }))
  // Import is explicit, local-only and bounded separately from model requests.
  app.use(['/api/v1/workspace/import', '/api/workspace/import'], express.json({ limit: '24mb' }))
  app.use('/api/v1', createAttachmentsRouter(options.attachments ?? attachmentService))
  app.use('/api', createAttachmentsRouter(options.attachments ?? attachmentService))
  app.use(['/api/v1/knowledge', '/api/knowledge'], express.json({limit: '2mb'}))
  // Bounded document text occurs in both project and analysis snapshots; keep the
  // smaller default limit for unrelated APIs.
  app.use(
    [
      '/api/v1/projects/analyze',
      '/api/projects/analyze',
      '/api/v1/projects',
      '/api/projects',
      '/api/v1/defense/sessions',
      '/api/defense/sessions',
    ],
    express.json({ limit: '1mb' }),
  )
  app.use(express.json({ limit: '256kb' }))
  const database = options.workspace || workspaceDatabase
  const persistent = options.workspace !== false
  const rawDefense = options.defense ?? (options.workspace
    ? createDefenseService(createSqliteDefenseRepository(database), undefined,
      createSqliteReportRepository(database), options.attachments ?? attachmentService)
    : defenseService)
  const projectAnalysis = persistent
    ? persistedProjectAnalysis(options.analyzeProject ?? analyzeProject, database)
    : options.analyzeProject ?? analyzeProject
  const defense = persistent
    ? authoritativeDefense(rawDefense, database)
    : rawDefense
  app.use('/api/v1', createWorkspaceRouter(database, options.attachments ?? attachmentService))
  app.use('/api', createWorkspaceRouter(database, options.attachments ?? attachmentService))
  app.use('/api/v1', createVoiceRouter(options.voice ?? voiceService))
  app.use('/api', createVoiceRouter(options.voice ?? voiceService))
  const knowledge = options.knowledge ?? knowledgeFor(options.attachments ?? attachmentService)
  app.use('/api/v1', createKnowledgeRouter(knowledge))
  app.use('/api', createKnowledgeRouter(knowledge))
  app.use('/api/v1', healthRouter, createProjectsRouter(projectAnalysis))
  app.use('/api', healthRouter, createProjectsRouter(projectAnalysis))
  app.use('/api/v1', createJudgesRouter(options.askJudge ?? askJudge))
  app.use('/api', createJudgesRouter(options.askJudge ?? askJudge))
  app.use('/api/v1', createDefenseRouter(defense))
  app.use('/api', createDefenseRouter(defense))
  const reports = options.reports ?? createReportService(rawDefense,
    options.workspace ? createSqliteReportRepository(database) : undefined,
    undefined, options.attachments ?? attachmentService)
  app.use('/api/v1', createReportsRouter(reports))
  app.use('/api', createReportsRouter(reports))
  app.use('/api/v1', createSettingsRouter(options.modelSettings ?? modelSettingsService, options.embeddingSettings ?? embeddingSettingsService))
  app.use('/api', createSettingsRouter(options.modelSettings ?? modelSettingsService, options.embeddingSettings ?? embeddingSettingsService))
  app.use(notFound)
  app.use(errorHandler)
  return app
}
export const app = createApp()
