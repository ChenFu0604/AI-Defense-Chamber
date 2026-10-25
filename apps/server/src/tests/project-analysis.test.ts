import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  analysisResponseSchema,
  analyzeProjectRequestSchema,
  type AnalysisOutput,
} from '@defense/shared'
import { createApp } from '../app.js'
import { createProjectAnalysisService } from '../services/project-analysis-service.js'
import type { AIClient } from '../services/ai-client.js'
import { AppError } from '../middleware/app-error.js'
import { analysisProject, validAnalysisOutput } from '../../../../tests/fixtures/analysis.js'
import { createWorkspaceDatabase } from '../storage/database.js'

function clientWith(output: AnalysisOutput): AIClient {
  return {
    async generate(task) {
      return { data: task.schema.parse(output), model: 'fixture-model' }
    },
  }
}
afterEach(() => vi.unstubAllEnvs())

describe('project analysis contracts and evidence', () => {
  it('defaults to live mode and validates complete project metadata', () => {
    expect(analyzeProjectRequestSchema.parse({ project: analysisProject }).mode).toBe('live')
    expect(
      analyzeProjectRequestSchema.safeParse({ project: { ...analysisProject, id: 'bad' } }).success,
    ).toBe(false)
    expect(
      analyzeProjectRequestSchema.safeParse({ project: analysisProject, mode: 'automatic' })
        .success,
    ).toBe(false)
  })
  it('keeps provenance and the analyzed snapshot in valid records', async () => {
    const result = await createProjectAnalysisService(clientWith(validAnalysisOutput()))({
      project: analysisProject,
      mode: 'live',
    })
    expect(analysisResponseSchema.safeParse({ success: true, data: result }).success).toBe(true)
    expect(result.mode).toBe('live')
    expect(result.projectId).toBe(analysisProject.id)
    expect(result.model).toBe('fixture-model')
  })
  it('rejects invented evidence excerpts', async () => {
    const output = validAnalysisOutput()
    output.coreValue.evidence[0]!.quote = '已获得一百万真实用户'
    await expect(
      createProjectAnalysisService(clientWith(output))({ project: analysisProject, mode: 'live' }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_EVIDENCE' })
  })
  it('rejects provided claims without evidence references', async () => {
    const output = validAnalysisOutput()
    output.coreValue.evidence = []
    await expect(
      createProjectAnalysisService(clientWith(output))({ project: analysisProject, mode: 'live' }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_EVIDENCE' })
  })
  it('does not call a model for explicit demo mode', async () => {
    const generate = vi.fn()
    const client: AIClient = {
      async generate(task) {
        generate()
        return { data: task.schema.parse(validAnalysisOutput()), model: 'unused-test-model' }
      },
    }
    const result = await createProjectAnalysisService(client)({
      project: analysisProject,
      mode: 'demo',
    })
    expect(generate).not.toHaveBeenCalled()
    expect(result).toMatchObject({ mode: 'demo', model: null })
    expect(result.output.coreValue.summary).toContain('模拟')
  })
})

describe('project analysis HTTP API', () => {
  const app = createApp({
    workspace: false,
    analyzeProject: createProjectAnalysisService(clientWith(validAnalysisOutput())),
  })
  it.each(['/api/projects/analyze', '/api/v1/projects/analyze'])(
    'accepts the analysis request at %s',
    async (path) => {
      const result = await request(app).post(path).send({ project: analysisProject }).expect(200)
      expect(analysisResponseSchema.safeParse(result.body).success).toBe(true)
      expect(result.headers['cache-control']).toBe('no-store')
    },
  )
  it.each([
    {},
    { project: {} },
    { project: { ...analysisProject, name: ' ' } },
    { project: analysisProject, mode: 'bad' },
  ])('rejects invalid input before calling the model', async (body) => {
    const analyzeProject = vi.fn()
    const result = await request(createApp({ workspace: false, analyzeProject }))
      .post('/api/projects/analyze')
      .send(body)
      .expect(400)
    expect(result.body.error.code).toBe('VALIDATION_ERROR')
    expect(analyzeProject).not.toHaveBeenCalled()
  })
  it('shows missing configuration without silently returning demo results', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('OPENAI_MODEL', '')
    const database = createWorkspaceDatabase(':memory:')
    await database.importBrowser({requestId: crypto.randomUUID(), projects: {version: 1, projects: [analysisProject], revisions: [], archivedIds: []}, analyses: [], history: null, tasks: []})
    const result = await request(createApp({workspace: database}))
      .post('/api/projects/analyze')
      .send({ project: analysisProject })
      .expect(503)
    expect(result.body.error.code).toBe('AI_NOT_CONFIGURED')
    expect(result.body).not.toHaveProperty('data')
    await database.close()
  })
  it('still allows explicit demo while credentials are missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('OPENAI_MODEL', '')
    const database = createWorkspaceDatabase(':memory:')
    await database.importBrowser({requestId: crypto.randomUUID(), projects: {version: 1, projects: [analysisProject], revisions: [], archivedIds: []}, analyses: [], history: null, tasks: []})
    const result = await request(createApp({workspace: database}))
      .post('/api/projects/analyze')
      .send({ project: analysisProject, mode: 'demo' })
      .expect(200)
    expect(result.body.data).toMatchObject({ mode: 'demo', model: null })
    expect((await database.listAnalyses(analysisProject.id))[0]?.id).toBe(result.body.data.id)
    await database.close()
  })
  it.each([
    [504, 'AI_TIMEOUT'],
    [502, 'AI_INVALID_OUTPUT'],
    [429, 'AI_RATE_LIMITED'],
  ])('preserves typed AI error %s %s', async (status, code) => {
    const failing = createApp({
      workspace: false,
      analyzeProject: async () => {
        throw new AppError(Number(status), String(code), '明确的失败原因')
      },
    })
    const result = await request(failing)
      .post('/api/projects/analyze')
      .send({ project: analysisProject })
      .expect(Number(status))
    expect(result.body).toEqual({ success: false, error: { code, message: '明确的失败原因' } })
  })
  it('does not expose secrets or stack traces in unexpected failures', async () => {
    const failing = createApp({
      workspace: false,
      analyzeProject: async () => {
        throw new Error('private-secret-key')
      },
    })
    const result = await request(failing)
      .post('/api/projects/analyze')
      .send({ project: analysisProject })
      .expect(500)
    expect(JSON.stringify(result.body)).not.toContain('private-secret-key')
    expect(result.body).not.toHaveProperty('stack')
  })
})
