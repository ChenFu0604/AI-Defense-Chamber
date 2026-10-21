import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, unlink, rmdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  createDefenseRequestSchema,
  answerRequestSchema,
  defenseResponseSchema,
  type DefenseSession,
} from '@defense/shared'
import { createApp } from '../app.js'
import { createDefenseService } from '../services/defense-service.js'
import { createDefenseRepository, type DefenseRepository } from '../services/defense-repository.js'
import { createDefenseModel } from '../services/defense-model.js'
import { buildDefenseContext, MAX_DEFENSE_CONTEXT_CHARS } from '../services/defense-context.js'
import { createAIClient, type AIClient } from '../services/ai-client.js'
import { AppError } from '../middleware/app-error.js'
import { defenseInput, defenseFixture } from '../../../../tests/fixtures/defense.js'

function memoryRepository() {
  const records = new Map<string, DefenseSession>()
  const repository: DefenseRepository = {
    async get(id) {
      return structuredClone(records.get(id) ?? null)
    },
    async save(session) {
      records.set(session.id, structuredClone(session))
    },
  }
  return { repository, records }
}
function setup(mode: 'live' | 'demo' = 'demo', model = createDefenseModel()) {
  const { repository, records } = memoryRepository(),
    service = createDefenseService(repository, model)
  return {
    repository,
    records,
    service,
    app: createApp({ defense: service }),
    input: defenseInput(mode),
  }
}
const answer = (
  session: DefenseSession,
  text = '我们计划访谈二十名学生，先记录原始需求再开展小规模试点。',
) => ({ requestId: randomUUID(), questionId: session.currentQuestionId!, answer: text })
async function started(env: ReturnType<typeof setup>) {
  const session = await env.service.create(env.input)
  return env.service.initial(session.id, randomUUID())
}
afterEach(() => vi.unstubAllEnvs())

describe('defense workflow API', () => {
  it('finishes after the final permitted answer without an extra model call', async () => {
    const env = setup(),
      first = await started(env)
    const question = first.messages[0]!
    first.messages = Array.from({ length: 30 }, (_, index) => ({
      ...structuredClone(question),
      id: randomUUID(),
      content: `【模拟】第${index + 1}项不同问题`,
      question: { ...question.question!, question: `【模拟】第${index + 1}项不同问题` },
    }))
    first.currentQuestionId = first.messages.at(-1)!.id
    env.records.set(first.id, structuredClone(first))
    await expect(
      env.service.switchJudge(first.id, {
        requestId: randomUUID(),
        questionId: first.currentQuestionId,
        judgeId: 'technical',
      }),
    ).rejects.toMatchObject({ code: 'TURN_LIMIT' })
    const ended = await env.service.answer(first.id, answer(first))
    expect(ended.status).toBe('ended')
    expect(ended.messages.filter((v) => v.sender === 'judge')).toHaveLength(30)
    expect(ended.messages.at(-1)?.status).toBe('sent')
  })
  it('does not report an unsaved generated question as success', async () => {
    const env = setup(),
      first = await started(env),
      originalSave = env.repository.save
    let writes = 0
    env.repository.save = async (session) => {
      writes++
      if (writes === 2) throw new AppError(500, 'SESSION_STORAGE_ERROR', '测试落盘失败')
      await originalSave(session)
    }
    await expect(env.service.answer(first.id, answer(first))).rejects.toMatchObject({
      code: 'SESSION_STORAGE_ERROR',
    })
    const saved = await env.service.get(first.id)
    expect(saved.status).toBe('failed')
    expect(saved.messages.filter((v) => v.sender === 'judge')).toHaveLength(1)
    expect(saved.messages.filter((v) => v.sender === 'user')).toHaveLength(1)
  })
  it('creates an idempotent pending session and validates project/source', async () => {
    const env = setup()
    const first = await request(env.app).post('/api/defense/sessions').send(env.input).expect(201)
    expect(defenseResponseSchema.safeParse(first.body).success).toBe(true)
    expect(first.body.data.status).toBe('ready')
    expect(
      (await request(env.app).post('/api/v1/defense/sessions').send(env.input).expect(201)).body
        .data.id,
    ).toBe(first.body.data.id)
    await request(env.app)
      .post('/api/defense/sessions')
      .send({ ...env.input, project: { ...env.input.project, name: 'different' } })
      .expect(400)
    await request(env.app)
      .post('/api/defense/sessions')
      .send({ ...env.input, judgeId: 'devil' })
      .expect(409)
    expect(createDefenseRequestSchema.safeParse({ ...env.input, mode: 'live' }).success).toBe(false)
  })
  it('supports initial question, multi-round answers, judge switching, end and report retrieval', async () => {
    const env = setup(),
      first = await started(env)
    let session = first
    for (const content of [
      '我们尚未取得真实使用数据，准备做二十名学生的访谈。',
      '技术原型使用权限隔离，我们准备通过端到端测试验证恢复流程。',
      '用户反馈暂未收集，计划观察三种任务的完成时间。',
    ]) {
      const response = await request(env.app)
        .post(`/api/defense/sessions/${session.id}/answer`)
        .send(answer(session, content))
        .expect(200)
      session = response.body.data
      expect(session.messages.at(-1)!.content).toContain(content.slice(0, 40))
      expect(session.messages.at(-1)!.assessment!.answerQuote).toBe(content.slice(0, 40))
    }
    const previousId = session.currentQuestionId
    session = (
      await request(env.app)
        .post(`/api/defense/sessions/${session.id}/judge`)
        .send({
          requestId: randomUUID(),
          questionId: session.currentQuestionId,
          judgeId: 'technical',
        })
        .expect(200)
    ).body.data
    expect(session.currentJudgeId).toBe('technical')
    expect(session.messages.find((v) => v.id === previousId)?.status).toBe('superseded')
    expect(session.messages.filter((v) => v.sender === 'user')).toHaveLength(3)
    const end = await request(env.app)
      .post(`/api/defense/sessions/${session.id}/end`)
      .send({})
      .expect(200)
    expect(end.body.data.status).toBe('ended')
    const again = await request(env.app)
      .post(`/api/defense/sessions/${session.id}/end`)
      .send({})
      .expect(200)
    expect(again.body.data.endedAt).toBe(end.body.data.endedAt)
    await request(env.app)
      .post(`/api/defense/sessions/${session.id}/answer`)
      .send(answer(session))
      .expect(409)
    await request(env.app)
      .post(`/api/defense/sessions/${session.id}/judge`)
      .send({ requestId: randomUUID(), questionId: session.currentQuestionId, judgeId: 'user' })
      .expect(409)
    expect(
      (await request(env.app).get(`/api/defense/sessions/${session.id}`).expect(200)).body.data
        .messages,
    ).toEqual(session.messages)
  })
  it('deduplicates replayed answers and rejects changed content or stale question', async () => {
    const env = setup(),
      first = await started(env),
      payload = answer(first)
    const next = await env.service.answer(first.id, payload)
    expect((await env.service.answer(first.id, payload)).messages).toEqual(next.messages)
    await expect(
      env.service.answer(first.id, { ...payload, answer: 'different' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    await expect(env.service.answer(first.id, answer(first))).rejects.toMatchObject({
      code: 'STALE_QUESTION',
    })
  })
  it('rejects empty answers and unknown or invalid IDs', async () => {
    const env = setup(),
      session = await started(env)
    await request(env.app)
      .post(`/api/defense/sessions/${session.id}/answer`)
      .send(answer(session, '  '))
      .expect(400)
    expect(answerRequestSchema.safeParse(answer(session, 'x'.repeat(4001))).success).toBe(false)
    expect(
      (await request(env.app).get(`/api/defense/sessions/${randomUUID()}`).expect(404)).body.error
        .code,
    ).toBe('SESSION_NOT_FOUND')
    await request(env.app).get('/api/defense/sessions/invalid').expect(400)
    await request(env.app).get('/api/defense/sessions/..%2Fsecret').expect(400)
  })
  it('keeps live sessions honest when model configuration is missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('OPENAI_MODEL', '')
    const env = setup('live'),
      session = await env.service.create(env.input)
    const response = await request(env.app)
      .post(`/api/defense/sessions/${session.id}/question`)
      .send({ requestId: randomUUID() })
      .expect(503)
    expect(response.body.error.code).toBe('AI_NOT_CONFIGURED')
    const saved = await env.service.get(session.id)
    expect(saved.status).toBe('failed')
    expect(saved.messages).toHaveLength(0)
    expect(saved.mode).toBe('live')
  })
  it('keeps answered messages on timeout and retries the same request without duplicates', async () => {
    const fallback = createDefenseModel()
    let fail = false
    const env = setup('demo', async (...args) => {
      if (fail) throw new AppError(504, 'AI_TIMEOUT', '测试超时')
      return fallback(...args)
    })
    const first = await started(env),
      payload = answer(first)
    fail = true
    await expect(env.service.answer(first.id, payload)).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    })
    const saved = await env.service.get(first.id)
    expect(saved.status).toBe('failed')
    expect(saved.messages.at(-1)).toMatchObject({
      sender: 'user',
      content: payload.answer,
      status: 'failed',
    })
    await expect(
      env.service.answer(first.id, { ...payload, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'PENDING_ACTION' })
    fail = false
    const recovered = await env.service.answer(first.id, payload)
    expect(recovered.messages.filter((v) => v.sender === 'user')).toHaveLength(1)
    expect(recovered.status).toBe('awaiting_answer')
  })
  it('rejects concurrent mutations and recovers generating state after restart', async () => {
    let resolve!: () => void
    const ready = new Promise<void>((done) => {
      resolve = done
    })
    const fallback = createDefenseModel(),
      env = setup('demo', async (...args) => {
        await ready
        return fallback(...args)
      })
    const session = await env.service.create(env.input),
      requestId = randomUUID()
    const pending = env.service.initial(session.id, requestId)
    await vi.waitFor(() => expect(env.records.get(session.id)?.status).toBe('generating'))
    await expect(env.service.initial(session.id, requestId)).rejects.toMatchObject({
      code: 'SESSION_BUSY',
    })
    await expect(env.service.end(session.id)).rejects.toMatchObject({ code: 'SESSION_BUSY' })
    expect((await env.service.get(session.id)).status).toBe('generating')
    resolve()
    await pending
    const saved = structuredClone(env.records.get(session.id)!)
    saved.status = 'generating'
    saved.pending = {
      type: 'initial',
      requestId: randomUUID(),
      questionId: null,
      answerMessageId: null,
      judgeId: 'business',
      fingerprint: 'x'.repeat(64),
    }
    env.records.set(session.id, saved)
    const restarted = createDefenseService(env.repository)
    expect((await restarted.get(session.id)).error?.code).toBe('REQUEST_INTERRUPTED')
  })
  it('reports storage failure instead of successful creation', async () => {
    const repository: DefenseRepository = {
      get: async () => null,
      save: async () => {
        throw new AppError(500, 'SESSION_STORAGE_ERROR', '保存失败')
      },
    }
    const response = await request(createApp({ defense: createDefenseService(repository) }))
      .post('/api/defense/sessions')
      .send(defenseInput('demo'))
      .expect(500)
    expect(response.body.success).toBe(false)
  })
})

describe('bounded context and grounded model output', () => {
  it('includes complete latest answer, project, current question, risks and cross-role recent history within budget', () => {
    const session = defenseFixture('demo')
    const content = '回答'.repeat(1800)
    session.messages = Array.from({ length: 40 }, () => ({
      id: randomUUID(),
      sender: 'user' as const,
      content,
      createdAt: session.createdAt,
      judgeId: 'technical' as const,
      status: 'sent' as const,
      question: null,
      assessment: null,
      replyTo: null,
      requestId: randomUUID(),
      model: null,
    }))
    const context = buildDefenseContext(session, null, content, 'business')
    expect(context.latestAnswer).toBe(content)
    expect(context.project.name).toBe(session.project.name)
    expect(context.recentHistory.length).toBeLessThanOrEqual(8)
    expect(context.recentHistory[0]!.judgeId).toBe('technical')
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(MAX_DEFENSE_CONTEXT_CHARS)
  })
  it('supplies the answer and role to the actual model task', async () => {
    const capture = vi.fn()
    const client: AIClient = {
      async generate(task) {
        capture(task)
        const context = JSON.parse(task.user)
        return {
          data: task.schema.parse({
            question: {
              judgeId: 'technical',
              question: '对于「' + context.latestAnswer + '」，如何测试权限隔离？',
              questionType: 'feasibility',
              riskLevel: 'medium',
              focus: '权限',
              rationale: '检验技术边界',
            },
            assessment: {
              answerQuote: context.latestAnswer,
              evaluation: 'evidence_missing',
              feedback: '需要测试依据',
              nextStrategy: 'test_boundary',
              risks: [],
            },
          }),
          model: 'fixture',
        }
      },
    }
    await createDefenseModel(client)(defenseFixture(), 'technical', null, '采用隔离设计')
    expect(JSON.parse(capture.mock.calls[0]![0].user).latestAnswer).toBe('采用隔离设计')
    expect(capture.mock.calls[0]![0].system).toContain('技术评委')
  })
  it('saves a naturally worded guided follow-up while keeping its exact answer evidence', async () => {
    const quote = '还没找人试用',
      guidedQuestion = '可以先从熟悉的人开始，你想请哪一类人来试一试？'
    const client: AIClient = {
      async generate(task) {
        const context = JSON.parse(task.user)
        return {
          model: 'fixture',
          data: task.schema.parse({
            question: {
              judgeId: 'business',
              question: context.latestAnswer ? guidedQuestion : '你最想先帮哪一类人？',
              questionType: 'clarification',
              riskLevel: 'low',
              focus: '第一批试用者',
              rationale: '回答说明还没有试用，可以先缩小邀请范围，决定第一步。',
            },
            assessment: context.latestAnswer
              ? {
                  answerQuote: quote,
                  evaluation: 'evidence_missing',
                  feedback: '目前还缺真实使用反馈。可以先请一人完成最重要的任务，看看哪里卡住。',
                  nextStrategy: 'change_direction',
                  risks: [],
                }
              : null,
          }),
        }
      },
    }
    const env = setup('live', createDefenseModel(client)),
      first = await started(env),
      next = await env.service.answer(first.id, answer(first, '目前还没找人试用，不知道先找谁。'))
    const saved = await env.service.get(next.id)
    expect(saved.messages.at(-1)).toMatchObject({
      content: guidedQuestion,
      assessment: { answerQuote: quote, evaluation: 'evidence_missing' },
      replyTo: saved.messages.at(-2)!.id,
    })
    expect(guidedQuestion).not.toContain(quote)
    expect(defenseResponseSchema.safeParse({ success: true, data: saved }).success).toBe(true)
  })
  it('permits a new detail in the same topic but still rejects a repeated question', async () => {
    const session = defenseFixture(),
      quote = '有两个测试账号',
      previous = '你准备怎样检查账号之间的数据访问？'
    session.messages = [
      {
        id: randomUUID(),
        sender: 'judge',
        content: previous,
        createdAt: session.createdAt,
        judgeId: 'technical',
        status: 'sent',
        question: {
          judgeId: 'technical',
          question: previous,
          questionType: 'feasibility',
          riskLevel: 'medium',
          focus: '数据权限',
          rationale: '检查账号之间的数据访问。',
        },
        assessment: null,
        replyTo: null,
        requestId: randomUUID(),
        model: 'fixture',
      },
    ]
    const generate = (question: string): AIClient => ({
      async generate(task) {
        return {
          model: 'fixture',
          data: task.schema.parse({
            question: { ...session.messages[0]!.question, question },
            assessment: {
              answerQuote: quote,
              evaluation: 'unclear',
              feedback: '有测试账号，可以再选一个越权访问的情况检查。',
              nextStrategy: 'test_boundary',
              risks: [],
            },
          }),
        }
      },
    })
    const detail = '如果换成另一个账号的记录编号，你希望系统怎么处理？'
    const result = await createDefenseModel(generate(detail))(
      session, 'technical', session.messages[0]!.question, quote,
    )
    expect(result.data.question.question).toBe(detail)
    await expect(
      createDefenseModel(generate(previous))(
        session, 'technical', session.messages[0]!.question, quote,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_QUESTION' })
  })
  it('still rejects a missing assessment and invented first-answer feedback', async () => {
    const client: AIClient = {
      async generate(task) {
        return {
          model: 'fixture',
          data: task.schema.parse({
            question: {
              judgeId: 'business',
              question: '你想先找哪一类人试用？',
              questionType: 'clarification',
              riskLevel: 'low',
              focus: '试用人群',
              rationale: '选择一个可以开始的方向。',
            },
            assessment: null,
          }),
        }
      },
    }
    await expect(
      createDefenseModel(client)(defenseFixture(), 'business', null, '暂时没有试用者'),
    ).rejects.toMatchObject({ code: 'AI_UNGROUNDED_FOLLOWUP' })
    const invented: AIClient = {
      async generate(task) {
        const result = await client.generate(task)
        return {
          ...result,
          data: task.schema.parse({
            ...(result.data as object),
            assessment: {
              answerQuote: '不存在的回答',
              evaluation: 'unclear',
              feedback: '测试',
              nextStrategy: 'change_direction',
              risks: [],
            },
          }),
        }
      },
    }
    await expect(
      createDefenseModel(invented)(defenseFixture(), 'business', null, null),
    ).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' })
  })
  it('rejects unrelated fabricated answer references and invalid model JSON', async () => {
    const fake: AIClient = {
      async generate(task) {
        return {
          model: 'fixture',
          data: task.schema.parse({
            question: {
              judgeId: 'business',
              question: '无关问题？',
              questionType: 'evidence',
              riskLevel: 'low',
              focus: '市场',
              rationale: '测试',
            },
            assessment: {
              answerQuote: '伪造内容',
              evaluation: 'unclear',
              feedback: '测试',
              nextStrategy: 'probe_evidence',
              risks: [],
            },
          }),
        }
      },
    }
    await expect(
      createDefenseModel(fake)(defenseFixture(), 'business', null, '真实回答'),
    ).rejects.toMatchObject({ code: 'AI_UNGROUNDED_FOLLOWUP' })
    const client = createAIClient(
      {
        apiKey: 'test',
        baseUrl: 'https://fixture.invalid/v1',
        model: 'fixture',
        timeoutMs: 1000,
        responseFormat: 'json_schema',
      },
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ choices: [{ message: { content: '{invalid' }, finish_reason: 'stop' }] }),
        ),
    )
    await expect(
      createDefenseModel(client)(defenseFixture(), 'business', null, null),
    ).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' })
  })
})

describe('file-backed persistence', () => {
  const directories: string[] = []
  afterEach(async () => {
    for (const directory of directories.splice(0)) {
      for (const file of await readdir(directory)) await unlink(join(directory, file))
      await rmdir(directory)
    }
  })
  it('restores full sessions in a fresh service instance', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'defense-test-'))
    directories.push(directory)
    const service = createDefenseService(createDefenseRepository(directory))
    const created = await service.create(defenseInput('demo'))
    const first = await service.initial(created.id, randomUUID())
    const completed = await service.answer(created.id, answer(first))
    const restarted = createDefenseService(createDefenseRepository(directory))
    expect(await restarted.get(created.id)).toEqual(completed)
  })
  it('preserves corrupted files and rejects traversal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'defense-test-'))
    directories.push(directory)
    const repository = createDefenseRepository(directory),
      id = randomUUID()
    await writeFile(join(directory, id + '.json'), '{broken', 'utf8')
    await expect(repository.get(id)).rejects.toMatchObject({ code: 'SESSION_STORAGE_CORRUPT' })
    expect(await readdir(directory)).toContain(id + '.json')
    await expect(repository.get('../secret')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})
