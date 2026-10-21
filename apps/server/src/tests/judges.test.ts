import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  judgeDefinitions,
  judgeIds,
  judgeQuestionSchema,
  judgeQuestionRequestSchema,
  judgeResponseSchema,
  questionsAreSimilar,
  type JudgeId,
  type JudgeQuestionRequest,
} from '@defense/shared'
import { judgeConfigs } from '../config/judges.js'
import { createJudgeService } from '../services/judge-service.js'
import { createAIClient, type AIClient } from '../services/ai-client.js'
import { createApp } from '../app.js'
import { AppError } from '../middleware/app-error.js'
import { analysisFixture, analysisProject } from '../../../../tests/fixtures/analysis.js'

const input = (
  judgeId: JudgeId = 'business',
  mode: 'live' | 'demo' = 'live',
): JudgeQuestionRequest => ({
  project: analysisProject,
  analysis: analysisFixture(mode),
  judgeId,
  mode,
  history: [],
})
const question = (judgeId: JudgeId = 'business') => ({
  judgeId,
  question: '校园循环项目如何验证目标学生群体的真实付费意愿？',
  questionType: 'evidence',
  riskLevel: 'medium',
  focus: '付费需求',
  rationale: '需要真实样本，不假设需求已经成立。',
})
const client: AIClient = {
  async generate(task) {
    return {
      data: task.schema.parse(question(JSON.parse(task.user).judgeId)),
      model: 'test-fixture-model',
    }
  },
}
afterEach(() => vi.unstubAllEnvs())

describe('judge configuration and contracts', () => {
  it('has four complete unique roles and server-only distinct stances', () => {
    expect(judgeDefinitions.map((j) => j.id)).toEqual([...judgeIds])
    expect(new Set(judgeConfigs.map((j) => j.systemPrompt)).size).toBe(4)
    const markers = ['创业导师', '资深工程师', '普通使用者', '挑错者']
    judgeConfigs.forEach((judge, index) => {
      expect(judge.name).toBeTruthy()
      expect(judge.introduction).toBeTruthy()
      expect(judge.icon).toBeTruthy()
      expect(judge.color).toBeTruthy()
      expect(judge.dimensions.length).toBeGreaterThanOrEqual(5)
      expect(judge.followUpRules.length).toBeGreaterThanOrEqual(3)
      expect(judge.initialStatus).toBe('waiting')
      expect(judge.systemPrompt).toContain(markers[index]!)
      expect(judge.systemPrompt).toContain(judge.strategy)
      expect(judgeDefinitions[index]).not.toHaveProperty('systemPrompt')
    })
  })
  it('validates speech enums, required text and risk levels', () => {
    expect(judgeQuestionSchema.safeParse(question()).success).toBe(true)
    for (const override of [
      { judgeId: 'technology' },
      { question: ' ' },
      { riskLevel: 'critical' },
      { questionType: 'score' },
      { rationale: undefined },
    ])
      expect(judgeQuestionSchema.safeParse({ ...question(), ...override }).success).toBe(false)
  })
  it('rejects stale snapshots, mismatched source and excessive history', () => {
    expect(judgeQuestionRequestSchema.safeParse(input()).success).toBe(true)
    expect(
      judgeQuestionRequestSchema.safeParse({
        ...input(),
        project: { ...analysisProject, description: 'changed' },
      }).success,
    ).toBe(false)
    expect(judgeQuestionRequestSchema.safeParse({ ...input(), mode: 'demo' }).success).toBe(false)
    expect(
      judgeQuestionRequestSchema.safeParse({ ...input(), history: Array(33).fill(question()) })
        .success,
    ).toBe(false)
  })
  it('detects normalized and near duplicate questions, preserving distinct angles', () => {
    expect(questionsAreSimilar('用户 为什么选择你？', '用户为什么选择你!')).toBe(true)
    expect(
      questionsAreSimilar(
        '请给出目标学生使用产品的具体数据与证据。',
        '请给出目标学生使用产品的具体数据和证据？',
      ),
    ).toBe(true)
    expect(questionsAreSimilar('付费转化如何验证？', '服务器失效如何恢复？')).toBe(false)
  })
})

describe('judge service and HTTP API', () => {
  it.each(judgeIds)(
    'offers three distinct demo questions and reports exhaustion for %s',
    async (id) => {
      const current = input(id, 'demo')
      const service = createJudgeService(client)
      for (let count = 0; count < 3; count++) {
        const statement = await service(current)
        current.history.push(statement.speech)
      }
      expect(new Set(current.history.map((item) => item.question)).size).toBe(3)
      await expect(service(current)).rejects.toMatchObject({ code: 'DEMO_QUESTIONS_EXHAUSTED' })
    },
  )
  const app = createApp({ askJudge: createJudgeService(client) })
  it.each(['/api/judges/question', '/api/v1/judges/question'])(
    'accepts %s and binds provenance',
    async (path) => {
      const response = await request(app).post(path).send(input()).expect(200)
      expect(judgeResponseSchema.safeParse(response.body).success).toBe(true)
      expect(response.body.data).toMatchObject({
        mode: 'live',
        model: 'test-fixture-model',
        analysisId: input().analysis.id,
        speech: { judgeId: 'business' },
      })
      expect(response.headers['cache-control']).toBe('no-store')
    },
  )
  it.each(judgeIds)('uses an independent prompt and current profile for %s', async (id) => {
    const capture = vi.fn()
    const model: AIClient = {
      async generate(task) {
        capture(task)
        return { data: task.schema.parse(question(id)), model: 'fixture' }
      },
    }
    await createJudgeService(model)(input(id))
    expect(capture.mock.calls[0]![0].system).toBe(
      judgeConfigs.find((j) => j.id === id)!.systemPrompt,
    )
    expect(JSON.parse(capture.mock.calls[0]![0].user).profile).toEqual(input().analysis.output)
  })
  it('provides explicit different demo questions without invoking any model', async () => {
    const never: AIClient = { generate: vi.fn().mockRejectedValue(new Error('must not call')) }
    const results = await Promise.all(
      judgeIds.map((id) => createJudgeService(never)(input(id, 'demo'))),
    )
    expect(never.generate).not.toHaveBeenCalled()
    expect(new Set(results.map((r) => r.speech.question)).size).toBe(4)
    for (const result of results) {
      expect(result).toMatchObject({ mode: 'demo', model: null })
      expect(result.speech.question).toContain('模拟')
    }
  })
  it('rejects a wrong role and repeated question across roles', async () => {
    const wrong: AIClient = {
      async generate(task) {
        return { data: task.schema.parse(question('user')), model: 'fixture' }
      },
    }
    await expect(createJudgeService(wrong)(input())).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
    })
    await expect(
      createJudgeService(client)({
        ...input(),
        history: [judgeQuestionSchema.parse(question('technical'))],
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_QUESTION' })
  })
  it('validates before calling the service', async () => {
    const ask = vi.fn()
    await request(createApp({ askJudge: ask }))
      .post('/api/judges/question')
      .send({ ...input(), judgeId: 'bad' })
      .expect(400)
    expect(ask).not.toHaveBeenCalled()
  })
  it.each(['AI_TIMEOUT', 'AI_CONNECTION_FAILED'])(
    'propagates %s and never falls back to demo',
    async (code) => {
      const failing: AIClient = {
        generate: vi
          .fn()
          .mockRejectedValue(new AppError(code === 'AI_TIMEOUT' ? 504 : 502, code, '测试失败')),
      }
      const response = await request(createApp({ askJudge: createJudgeService(failing) }))
        .post('/api/judges/question')
        .send(input())
      expect(response.body).toEqual({ success: false, error: { code, message: '测试失败' } })
      expect(failing.generate).toHaveBeenCalledTimes(1)
    },
  )
  it('handles invalid model JSON through the shared client', async () => {
    const model = createAIClient(
      {
        apiKey: 'test',
        baseUrl: 'https://fixture.invalid/v1',
        model: 'fixture',
        timeoutMs: 1000,
        responseFormat: 'json_schema',
      },
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{bad json' }, finish_reason: 'stop' }],
          }),
        ),
      ),
    )
    const response = await request(createApp({ askJudge: createJudgeService(model) }))
      .post('/api/judges/question')
      .send(input())
      .expect(502)
    expect(response.body.error.code).toBe('AI_INVALID_OUTPUT')
  })
  it('returns configuration guidance for live mode without credentials', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('OPENAI_MODEL', '')
    const response = await request(createApp())
      .post('/api/judges/question')
      .send(input())
      .expect(503)
    expect(response.body.error.code).toBe('AI_NOT_CONFIGURED')
    expect(response.body).not.toHaveProperty('data')
  })
})
