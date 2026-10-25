import { z } from 'zod'
import { createProjectRecord, projectInputSchema, type AnalysisRecord, type ImprovementTask, type ProjectWorkspace } from '@defense/shared'
import { ServerApiError } from '../services/server-api'

// Isolated authoritative endpoint fixture; never reads formal LocalStorage data.
export function createWorkspaceApiFixture(initial: Partial<ProjectWorkspace> = {}) {
  const workspace: ProjectWorkspace = {version: 1, projects: [], revisions: [], archivedIds: [], ...structuredClone(initial)}
  const analyses: AnalysisRecord[] = [], tasks: ImprovementTask[] = []
  const createRequests = new Map<string, string>()
  let failure: Error | undefined, commitThenFail = false
  const request = async <T>(path: string, schema: z.ZodType<{success: true; data: T}>, options: {method?: string; body?: unknown; signal?: AbortSignal} = {}): Promise<T> => {
    if (failure) { const error = failure; failure = undefined; throw error }
    const method = options.method ?? 'GET'
    let data: unknown
    if (path === '/projects' && method === 'GET') data = workspace
    else if (path === '/improvements' && method === 'GET') data = tasks
    else if (path === '/projects' && method === 'POST') {
      const body = options.body as {requestId: string; input: unknown}
      const input = projectInputSchema.parse(body.input), fingerprint = JSON.stringify(input)
      const old = createRequests.get(body.requestId)
      if (old && old !== fingerprint) throw new ServerApiError('REQUEST_CONFLICT', '创建请求内容已变化。')
      let project = workspace.projects.find(project => project.id === body.requestId)
      if (!project) {
        project = createProjectRecord(input, body.requestId, new Date().toISOString())
        workspace.projects.unshift(project); createRequests.set(body.requestId, fingerprint)
      }
      data = project
    } else {
      const match = /^\/projects\/([^/]+)(\/analyses|\/archive)?$/.exec(path)
      if (!match) throw new Error('Unexpected fixture path ' + path)
      const id = match[1]!, project = workspace.projects.find(project => project.id === id)
      if (!project) throw new ServerApiError('PROJECT_NOT_FOUND', '服务端没有这个项目。')
      if (match[2] === '/analyses') data = analyses.filter(record => record.projectId === id)
      else if (match[2] === '/archive') {
        const {archived} = options.body as {archived: boolean}
        workspace.archivedIds = workspace.archivedIds.filter(key => key !== id)
        if (archived) workspace.archivedIds.push(id)
        data = workspace
      } else if (method === 'PUT') {
        const body = options.body as {expectedUpdatedAt: string; input: unknown}
        const input = projectInputSchema.parse(body.input)
        if (JSON.stringify(projectInputSchema.parse(project)) === JSON.stringify(input)) data = project
        else {
          if (body.expectedUpdatedAt !== project.updatedAt) throw new ServerApiError('PROJECT_CONFLICT', '项目已在其他页面更新，输入已保留。')
          const updated = {...input, id, createdAt: project.createdAt, updatedAt: new Date(Date.parse(project.updatedAt) + 1).toISOString()}
          let revision = workspace.revisions.find(item => item.projectId === id)
          if (!revision) {revision = {projectId: id, snapshots: []}; workspace.revisions.push(revision)}
          revision.snapshots.push(structuredClone(project))
          workspace.projects = workspace.projects.map(item => item.id === id ? updated : item)
          data = updated
        }
      } else data = project
    }
    if (commitThenFail && method !== 'GET') {commitThenFail = false; throw new ServerApiError('NETWORK_ERROR', '网络中断，无法确认服务端结果。')}
    return schema.parse({success: true, data: structuredClone(data)}).data
  }
  return {workspace, analyses, tasks, request, failNext: (error: Error) => {failure = error}, failAfterCommit: () => {commitThenFail = true}}
}
