import { Router } from 'express'
import { z } from 'zod'
import {
  projectCreateRequestSchema, projectUpdateRequestSchema, projectArchiveRequestSchema,
  taskCreateRequestSchema, taskUpdateRequestSchema, workspaceImportRequestSchema,
  analysisMatchesProject, type Attachment,
} from '@defense/shared'
import { env } from '../config/env.js'
import { AppError } from '../middleware/app-error.js'
import { type WorkspaceDatabase, workspaceDatabase } from '../storage/database.js'
import { attachmentService, type AttachmentService } from '../services/attachment-service.js'
import type { ProjectAnalysisService } from '../services/project-analysis-service.js'
import type { DefenseService } from '../services/defense-service.js'

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', result.error.issues[0]?.message ?? '记录参数无效。')
  return result.data
}
async function validateAttachments(attachments: AttachmentService, items: Attachment[] = []) {
  const unique = [...new Map(items.map(item => [item.id, item])).values()]
  for (let index = 0; index < unique.length; index += 4) await attachments.validate(unique.slice(index, index + 4))
}

export function createWorkspaceRouter(database: WorkspaceDatabase = workspaceDatabase, attachments: AttachmentService = attachmentService) {
  const router = Router()
  router.use((_, response, next) => { response.set('Cache-Control', 'no-store'); next() })
  router.get('/projects', async (_, response) => response.json({ success: true, data: await database.listProjects() }))
  router.post('/projects', async (request, response) => {
    const input = parse(projectCreateRequestSchema, request.body)
    await validateAttachments(attachments, input.input.attachments)
    response.status(201).json({ success: true, data: await database.createProject(input) })
  })
  router.get('/projects/:id/analyses', async (request, response) => {
    const id = parse(z.uuid(), request.params.id)
    response.json({ success: true, data: await database.listAnalyses(id) })
  })
  router.get('/projects/:id', async (request, response) => {
    const project = await database.getProject(parse(z.uuid(), request.params.id))
    if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', '项目不存在，请先导入旧浏览器项目或返回项目列表。')
    response.json({ success: true, data: project })
  })
  router.put('/projects/:id', async (request, response) => {
    const id = parse(z.uuid(), request.params.id), input = parse(projectUpdateRequestSchema, request.body)
    await validateAttachments(attachments, input.input.attachments)
    response.json({ success: true, data: await database.updateProject(id, input) })
  })
  router.patch('/projects/:id/archive', async (request, response) => {
    const id = parse(z.uuid(), request.params.id), input = parse(projectArchiveRequestSchema, request.body)
    response.json({ success: true, data: await database.setArchived(id, input.archived) })
  })
  router.get('/history', async (_, response) => response.json({ success: true, data: await database.listHistory() }))
  router.get('/improvements', async (_, response) => response.json({ success: true, data: await database.listTasks() }))
  router.post('/improvements', async (request, response) => response.status(201).json({ success: true, data: await database.addTask(parse(taskCreateRequestSchema, request.body)) }))
  router.put('/improvements/:id', async (request, response) => {
    const id = parse(z.uuid(), request.params.id), input = parse(taskUpdateRequestSchema, request.body)
    await validateAttachments(attachments, input.update.attachments)
    response.json({ success: true, data: await database.updateTask(id, input) })
  })
  router.post('/workspace/import', async (request, response) => {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
    const host = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(request.hostname)
    const origins = new Set([env.WEB_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173', `${request.protocol}://${request.get('host')}`])
    if (!local || !host || request.get('X-Workspace-Request') !== '1' || (request.get('origin') && !origins.has(request.get('origin')!)))
      throw new AppError(403, 'WORKSPACE_ACCESS_DENIED', '旧记录导入仅允许从本机应用页面发起。')
    const input = parse(workspaceImportRequestSchema, request.body)
    const projects = [...input.projects.projects, ...input.projects.revisions.flatMap(v => v.snapshots), ...(input.history?.projects ?? [])]
    const sessions = input.history?.entries.map(entry => entry.session) ?? []
    await validateAttachments(attachments, [
      ...projects.flatMap(p => p.attachments ?? []), ...sessions.flatMap(s => [
        ...(s.project.attachments ?? []), ...s.messages.flatMap(m => m.attachments ?? []),
        ...(s.training?.tasks?.flatMap(task => task.attachments ?? []) ?? []),
      ]), ...input.tasks.flatMap(t => t.attachments ?? []),
    ])
    response.json({ success: true, data: await database.importBrowser(input) })
  })
  router.get('/workspace/import/:id', async (request, response) => {
    response.json({ success: true, data: await database.getBrowserImport(parse(z.uuid(), request.params.id)) })
  })
  return router
}

// The browser's supplied snapshot may describe the request, but never replaces
// the server's current project or a saved analysis when starting training.
export function persistedProjectAnalysis(analyze: ProjectAnalysisService, database: WorkspaceDatabase): ProjectAnalysisService {
  return async (request, signal) => {
    const current = await database.getProject(request.project.id)
    if (!current) throw new AppError(404, 'PROJECT_NOT_FOUND', '请先保存项目或导入旧浏览器记录，再分析。')
    if (JSON.stringify(current) !== JSON.stringify(request.project))
      throw new AppError(409, 'PROJECT_VERSION_CONFLICT', '项目资料已更新，请刷新后重新分析。')
    const result = await analyze({ ...request, project: current }, signal)
    await database.saveAnalysis(result)
    return result
  }
}

export function authoritativeDefense(service: DefenseService, database: WorkspaceDatabase): DefenseService {
  async function resolve(project: Parameters<DefenseService['create']>[0]['project'], analysis: Parameters<DefenseService['create']>[0]['analysis']) {
    const current = await database.getProject(project.id)
    if (!current || JSON.stringify(current) !== JSON.stringify(project))
      throw new AppError(409, 'PROJECT_VERSION_CONFLICT', '项目未保存或已更新，请刷新后确认当前资料。')
    const saved = (await database.listAnalyses(project.id)).find(record => record.id === analysis.id)
    if (!saved || JSON.stringify(saved) !== JSON.stringify(analysis) || !analysisMatchesProject(saved, current))
      throw new AppError(409, 'ANALYSIS_VERSION_CONFLICT', '画像不属于已保存的当前项目版本，请重新分析。')
    return { project: current, analysis: saved }
  }
  return {
    ...service,
    async create(input) {
      // A retried accepted creation must be read with its original request snapshot,
      // even if the current project has since been edited.
      if (await database.getSession(input.requestId)) return service.create(input)
      return service.create({ ...input, ...await resolve(input.project, input.analysis) })
    },
    async retrain(id, input) {
      if (await database.getSession(input.requestId)) return service.retrain(id, input)
      const current = input.current ? await resolve(input.current.project, input.current.analysis) : undefined
      if (input.taskUpdates?.length) {
        const report = await database.getReport(id), tasks = await database.listTasks()
        for (const update of input.taskUpdates) {
          const task = tasks.find(item => item.sourceReportId === report?.id && item.improvementIndex === update.improvementIndex)
          if (!task || task.status !== update.status || task.note !== update.note ||
              JSON.stringify(task.attachments ?? []) !== JSON.stringify(update.attachments ?? []))
            throw new AppError(409, 'TASK_VERSION_CONFLICT', '改进任务进展已更新或尚未保存，请刷新核对后再创建复训。')
        }
      }
      return service.retrain(id, { ...input, ...(current ? { current } : {}) })
    },
  }
}
