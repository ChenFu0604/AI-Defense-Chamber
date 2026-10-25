import { mkdtemp, readFile, readdir, unlink, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  calculateOverallScore,
  defenseReportSchema,
  defenseSessionSchema,
  reportDimensionIds,
  reportOutputSchema,
  type DefenseReport,
  type DefenseSession,
} from '@defense/shared'
import {
  endedReportSession,
  reportOutputFixture,
  reportFixture,
  legacyReportFixture,
  reportAnswerId,
} from '../../../../tests/fixtures/report.js'
import { createReportService } from '../services/report-service.js'
import { createReportRepository, type ReportRepository } from '../services/report-repository.js'
import { buildReportContext, MAX_REPORT_CONTEXT_CHARS, reportSourceFingerprint } from '../services/report-context.js'
import { createAIClient, type AIClient, type StructuredAITask } from '../services/ai-client.js'
import { AppError } from '../middleware/app-error.js'
import { createApp } from '../app.js'

function setup(session = endedReportSession(), override?: AIClient) {
  const records = new Map<string, DefenseReport>()
  const repository: ReportRepository = {
    async get(id) {
      return structuredClone(records.get(id) ?? null)
    },
    async save(record) {
      records.set(record.sessionId, structuredClone(record))
    },
  }
  const get = vi.fn(async (id: string): Promise<DefenseSession> => {
    if (session.id !== id) throw new AppError(404, 'SESSION_NOT_FOUND', '会话不存在。')
    return structuredClone(session)
  })
  const generate = vi.fn(async (_task: StructuredAITask<unknown>) => ({
    data: reportOutputFixture(),
    model: 'fixture-model',
  }))
  const client: AIClient = override ?? {
    async generate(task) {
      const result = await generate(task)
      return { data: task.schema.parse(result.data), model: result.model }
    },
  }
  const reports = createReportService({ get }, repository, client)
  return { reports, repository, records, get, generate, session, client }
}
afterEach(() => vi.useRealTimers())

describe('report contracts and context', () => {
  it('validates complete real records and calculates the rounded equal-weight mean', () => {
    expect(defenseSessionSchema.safeParse(endedReportSession()).success).toBe(true)
    expect(calculateOverallScore(reportOutputFixture().dimensions)).toBe(62.4)
    expect(defenseReportSchema.safeParse(reportFixture()).success).toBe(true)
    expect(defenseReportSchema.safeParse({ ...reportFixture(), overallScore: 99 }).success).toBe(
      false,
    )
  })
  it.each([-1, 101, 50.5, NaN, Infinity])('rejects illegal score %s', (score) => {
    const output = reportOutputFixture()
    output.dimensions.logic.score = score
    expect(reportOutputSchema.safeParse(output).success).toBe(false)
    expect(() => calculateOverallScore(output.dimensions)).toThrow()
  })
  it('rejects missing dimensions and required fields, and forbids a model-supplied total', () => {
    const output = reportOutputFixture()
    expect(reportOutputSchema.safeParse({ ...output, limitations: undefined }).success).toBe(false)
    expect(
      reportOutputSchema.safeParse({ ...output, dimensions: { logic: output.dimensions.logic } })
        .success,
    ).toBe(false)
    expect(reportOutputSchema.safeParse({ ...output, overallScore: 100 }).success).toBe(false)
  })
  it('includes full submitted answers and questions with finite context bounds', () => {
    const session = endedReportSession()
    const result = buildReportContext(session),
      context = JSON.parse(result.serialized)
    expect(context.answers[0]).toMatchObject({
      messageId: reportAnswerId,
      answer: session.messages[1]!.content,
      question: session.messages[0]!.content,
      questionId: session.messages[0]!.id,
      questionType: 'evidence',
      precedingAnswerMessageId: null,
      judgeId: 'business',
    })
    expect(result.answerCount).toBe(1)
    expect(result.serialized.length).toBeLessThan(MAX_REPORT_CONTEXT_CHARS)
    session.messages[1]!.content = 'x'.repeat(MAX_REPORT_CONTEXT_CHARS)
    expect(() => buildReportContext(session)).toThrow('上下文上限')
  })
  it('provides actual answered-question links without counting an unanswered question as observation', () => {
    const session = endedReportSession(),
      questionId = crypto.randomUUID(),
      nextAnswerId = crypto.randomUUID()
    session.messages.push({
      ...session.messages[0]!,
      id: questionId,
      replyTo: reportAnswerId,
      content: '如果二十名学生的需求相反，你会怎样调整？',
    })
    let context = JSON.parse(buildReportContext(session).serialized)
    expect(context.answers).toHaveLength(1)
    expect(context.unansweredQuestionCount).toBe(1)
    session.messages.push({
      ...session.messages[1]!,
      id: nextAnswerId,
      replyTo: questionId,
      content: '先按实际使用场景分组，再核对相反意见的原因。',
    })
    context = JSON.parse(buildReportContext(session).serialized)
    expect(context.answers[1]).toMatchObject({
      messageId: nextAnswerId,
      questionId,
      precedingAnswerMessageId: reportAnswerId,
    })
    expect(context.unansweredQuestionCount).toBe(0)
  })
})

describe('report generation and persistence', () => {
  it.each(['json_schema', 'json_object'] as const)('sends explicit nullable observation states in API-compatible %s schemas', async (responseFormat) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      model: 'fixture-model',
      choices: [{ message: { content: JSON.stringify(reportOutputFixture()) }, finish_reason: 'stop' }],
    }))
    const client = createAIClient({
      apiKey: 'fixture-only', model: 'fixture-model', baseUrl: 'https://fixture.invalid/v1',
      timeoutMs: 1000, responseFormat,
    }, transport)
    const env = setup(undefined, client)
    expect((await env.reports.generate(env.session.id)).version).toBe(2)
    const body = JSON.parse(String(transport.mock.calls[0]![1]!.body))
    const schema = responseFormat === 'json_schema'
      ? body.response_format.json_schema.schema
      : JSON.parse(body.messages[0].content.split('\nJSON Schema:\n').at(-1))
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect(JSON.stringify(schema)).not.toContain('"oneOf"')
    for (const id of reportDimensionIds) {
      const branches = schema.properties.dimensions.properties[id].anyOf
      expect(branches).toHaveLength(2)
      expect(branches[0]).toMatchObject({
        additionalProperties: false,
        properties: { status: { enum: ['assessed'] }, score: { type: 'integer', minimum: 0, maximum: 100 }, references: { minItems: 1 } },
      })
      expect(branches[1]).toMatchObject({
        additionalProperties: false,
        properties: { status: { enum: ['insufficient'] }, score: { type: 'null' } },
      })
      expect(branches[0].required).toEqual(expect.arrayContaining(['status', 'score', 'reason', 'references']))
      expect(branches[1].required).toEqual(expect.arrayContaining(['status', 'score', 'reason', 'references']))
    }
  })
  it('generates, persists, reopens and reuses a report without a second model call', async () => {
    const env = setup(),
      result = await env.reports.generate(env.session.id)
    expect(result.overallScore).toBe(62.4)
    expect(result.answerCount).toBe(1)
    expect(await env.reports.get(env.session.id)).toEqual(result)
    const restarted = createReportService({ get: env.get }, env.repository, env.client)
    expect(await restarted.generate(env.session.id)).toEqual(result)
    expect(env.generate).toHaveBeenCalledTimes(1)
    expect(env.generate.mock.calls[0]![0].system).toContain('不要输出综合分')
    expect(result.version).toBe(2)
  })
  it.each(['partial', 'none'] as const)('persists and reopens %s observation coverage without inventing a total', async (coverage) => {
    const env = setup(),
      output = reportOutputFixture()
    const insufficientIds = coverage === 'none' ? reportDimensionIds : ['technical'] as const
    for (const id of insufficientIds) {
      output.dimensions[id] = {
        status: 'insufficient',
        score: null,
        reason: '本场尚未讨论该维度，需要补充相应问答后再评价。',
        references: [],
      }
    }
    env.generate.mockResolvedValueOnce({ data: output, model: 'fixture-model' })
    const app = createApp({ reports: env.reports }),
      url = `/api/v1/defense/sessions/${env.session.id}/report`
    const generated = await request(app).post(url).expect(200)
    expect(generated.body.data).toMatchObject({ version: 2, overallScore: null, output })
    const read = await request(app).get(url).expect(200)
    expect(read.body).toEqual(generated.body)
    expect(await env.reports.generate(env.session.id)).toEqual(generated.body.data)
    expect(env.generate).toHaveBeenCalledTimes(1)
    expect(env.records.get(env.session.id)?.overallScore).toBeNull()
  })
  it.each([
    { status: 'assessed', score: null },
    { status: 'insufficient', score: 64 },
    { status: 'assessed', score: 64, references: [] },
    { status: 'unknown', score: null },
  ])('rejects contradictory or invalid assessment state %j without saving', async (invalid) => {
    const output = reportOutputFixture()
    const data = {
      ...output,
      dimensions: { ...output.dimensions, technical: { ...output.dimensions.technical, ...invalid } },
    }
    const client = { generate: async () => ({ data, model: 'fixture' }) } as unknown as AIClient,
      env = setup(undefined, client)
    await expect(env.reports.generate(env.session.id)).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' })
    expect(env.records.size).toBe(0)
  })
  it('still validates citations supplied by an insufficient dimension', async () => {
    const output = reportOutputFixture()
    output.dimensions.technical = {
      status: 'insufficient',
      score: null,
      reason: '需要补充实现与验证情况。',
      references: [{ messageId: reportAnswerId, quote: '用户未说过的技术测量' }],
    }
    const client = { generate: async () => ({ data: output, model: 'fixture' }) } as unknown as AIClient,
      env = setup(undefined, client)
    await expect(env.reports.generate(env.session.id)).rejects.toMatchObject({ code: 'REPORT_INVALID_EVIDENCE' })
    expect(env.records.size).toBe(0)
  })
  it('returns an unchanged legacy cached report without reevaluating its unknown coverage', async () => {
    const env = setup(),
      legacy = legacyReportFixture()
    legacy.sourceFingerprint = reportSourceFingerprint(env.session)
    env.records.set(env.session.id, structuredClone(legacy))
    const save = vi.spyOn(env.repository, 'save')
    expect(await env.reports.get(env.session.id)).toEqual(legacy)
    expect(await env.reports.generate(env.session.id)).toEqual(legacy)
    expect(env.generate).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(env.records.get(env.session.id)).toEqual(legacy)
  })
  it('instructs the model to distinguish missing observation from a weak answer and avoids voice claims', async () => {
    const env = setup()
    await env.reports.generate(env.session.id)
    const system = env.generate.mock.calls[0]![0].system
    expect(system).toContain('score 必须为 null')
    expect(system).toContain('证据支撑差')
    expect(system).toContain('未发生有效追问及对应的用户回答时')
    expect(system).toContain('不能推断未经测量的反应速度')
    expect(system).not.toContain('分数仅为有限样本下的初步估计')
  })
  it('coalesces concurrent generation requests', async () => {
    let complete!: () => void
    const client: AIClient = {
      async generate(task) {
        await new Promise<void>((resolve) => {
          complete = resolve
        })
        return { data: task.schema.parse(reportOutputFixture()), model: 'fixture-model' }
      },
    }
    const env = setup(undefined, client)
    const first = env.reports.generate(env.session.id),
      second = env.reports.generate(env.session.id)
    expect(first).toBe(second)
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
    complete()
    expect(await first).toEqual(await second)
  })
  it('rejects unfinished, empty, and demo sessions before invoking the model', async () => {
    for (const [mutate, code] of [
      [
        (s: DefenseSession) => {
          s.status = 'awaiting_answer'
        },
        'REPORT_SESSION_NOT_ENDED',
      ],
      [
        (s: DefenseSession) => {
          s.messages = []
        },
        'REPORT_EMPTY_SESSION',
      ],
      [
        (s: DefenseSession) => {
          s.mode = 'demo'
        },
        'REPORT_DEMO_SESSION',
      ],
    ] as const) {
      const env = setup()
      mutate(env.session)
      await expect(env.reports.generate(env.session.id)).rejects.toMatchObject({ code })
      expect(env.generate).not.toHaveBeenCalled()
    }
  })
  it('rejects out-of-range model scores and invalid references without saving', async () => {
    for (const invalid of ['score', 'reference', 'missing'] as const) {
      const output = reportOutputFixture()
      if (invalid === 'score') output.dimensions.logic.score = 101
      if (invalid === 'reference')
        output.dimensions.logic.references[0]!.quote = '并不存在的实测数据'
      const data = invalid === 'missing' ? { summary: '缺失字段' } : output
      const client = { generate: async () => ({ data, model: 'fixture' }) } as unknown as AIClient
      const env = setup(undefined, client)
      await expect(env.reports.generate(env.session.id)).rejects.toMatchObject({
        code: invalid === 'reference' ? 'REPORT_INVALID_EVIDENCE' : 'AI_INVALID_OUTPUT',
      })
      expect(env.records.size).toBe(0)
    }
  })
  it('propagates a model failure, releases the lock and permits retry', async () => {
    const env = setup()
    env.generate.mockRejectedValueOnce(new AppError(502, 'AI_UNAVAILABLE', '模型不可用'))
    await expect(env.reports.generate(env.session.id)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    })
    expect(env.records.size).toBe(0)
    await env.reports.generate(env.session.id)
    expect(env.generate).toHaveBeenCalledTimes(2)
  })
  it('terminates a timed-out model request without persisting a report', async () => {
    vi.useFakeTimers()
    const transport = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () =>
            reject(new DOMException('abort', 'AbortError')),
          )
        }),
    )
    const client = createAIClient(
      {
        apiKey: 'fixture',
        model: 'fixture',
        baseUrl: 'https://fixture.invalid/v1',
        timeoutMs: 1000,
        responseFormat: 'json_schema',
      },
      transport,
    )
    const env = setup(undefined, client)
    const pending = expect(env.reports.generate(env.session.id)).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(1000)
    await pending
    expect(env.records.size).toBe(0)
    expect(transport.mock.calls[0]![1]!.signal!.aborted).toBe(true)
  })
  it('includes saved answers even when generating their follow-up failed', async () => {
    const env = setup()
    env.session.messages[1]!.status = 'failed'
    const record = await env.reports.generate(env.session.id)
    expect(record.answerCount).toBe(1)
    expect(JSON.parse(env.generate.mock.calls[0]![0].user).answers[0].answerStatus).toBe('failed')
  })
  it('does not report success after a failed write and does not overwrite stale reports', async () => {
    const env = setup()
    const save = vi
      .spyOn(env.repository, 'save')
      .mockRejectedValueOnce(new AppError(500, 'REPORT_STORAGE_ERROR', '磁盘错误'))
    await expect(env.reports.generate(env.session.id)).rejects.toMatchObject({
      code: 'REPORT_STORAGE_ERROR',
    })
    expect(env.records.size).toBe(0)
    save.mockRestore()
    await env.reports.generate(env.session.id)
    env.session.messages[1]!.content += '新增内容'
    await expect(env.reports.generate(env.session.id)).rejects.toMatchObject({
      code: 'REPORT_SOURCE_MISMATCH',
    })
    expect(env.generate).toHaveBeenCalledTimes(2)
  })
  it.each(['not-json', JSON.stringify({ choices: [{ message: { content: '{}' } }] })])(
    'handles invalid model transport output',
    async (body) => {
      const client = createAIClient(
        {
          apiKey: 'fixture',
          model: 'fixture',
          baseUrl: 'https://fixture.invalid/v1',
          timeoutMs: 1000,
          responseFormat: 'json_schema',
        },
        vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),
      )
      const env = setup(undefined, client)
      await expect(env.reports.generate(env.session.id)).rejects.toMatchObject({
        code: 'AI_INVALID_OUTPUT',
      })
      expect(env.records.size).toBe(0)
    },
  )
  it.each(['/api', '/api/v1'])(
    'serves generation and history with %s and meaningful missing errors',
    async (prefix) => {
      const env = setup(),
        app = createApp({ reports: env.reports }),
        url = `${prefix}/defense/sessions/${env.session.id}/report`
      const missing = await request(app).get(url).expect(404)
      expect(missing.body.error.code).toBe('REPORT_NOT_FOUND')
      const generated = await request(app).post(url).expect(200)
      expect(generated.headers['cache-control']).toBe('no-store')
      const history = await request(app).get(url).expect(200)
      expect(history.body).toEqual(generated.body)
      await request(app).post(url).expect(200)
      expect(env.generate).toHaveBeenCalledTimes(1)
      await request(app).get(`${prefix}/defense/sessions/not-uuid/report`).expect(400)
      await request(app)
        .post(`${prefix}/defense/sessions/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/report`)
        .expect(404)
    },
  )
})

describe('file-backed reports', () => {
  it('restores partial v2 and unchanged legacy v1 records from temporary disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'defense-report-coverage-test-'))
    try {
      const partial = reportFixture(),
        legacy = legacyReportFixture(),
        repository = createReportRepository(directory)
      partial.output.dimensions.technical = {
        status: 'insufficient',
        score: null,
        reason: '没有足够的技术实现问答。',
        references: [],
      }
      partial.overallScore = null
      legacy.sessionId = crypto.randomUUID()
      await repository.save(partial)
      await repository.save(legacy)
      const restarted = createReportRepository(directory)
      expect(await restarted.get(partial.sessionId)).toEqual(partial)
      expect(await restarted.get(legacy.sessionId)).toEqual(legacy)
      const rawLegacy = await readFile(join(directory, legacy.sessionId + '.json'), 'utf8')
      expect(JSON.parse(rawLegacy)).toEqual(legacy)
      expect(rawLegacy).not.toContain('"status"')
    } finally {
      for (const file of await readdir(directory)) await unlink(join(directory, file))
      await rmdir(directory)
    }
  })
  it('restores after restart, preserves corrupt data, and rejects traversal and disk failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'defense-report-test-'))
    try {
      const record = reportFixture(),
        repository = createReportRepository(directory)
      await repository.save(record)
      expect(await createReportRepository(directory).get(record.sessionId)).toEqual(record)
      expect(await readdir(directory)).toEqual([record.sessionId + '.json'])
      await expect(repository.get('../secret')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
      const file = join(directory, record.sessionId + '.json')
      await writeFile(file, '{broken')
      await expect(repository.get(record.sessionId)).rejects.toMatchObject({
        code: 'REPORT_STORAGE_CORRUPT',
      })
      expect(await readFile(file, 'utf8')).toBe('{broken')
      await expect(createReportRepository(file).save(record)).rejects.toMatchObject({
        code: 'REPORT_STORAGE_ERROR',
      })
    } finally {
      for (const file of await readdir(directory)) await unlink(join(directory, file))
      await rmdir(directory)
    }
  })
})
