import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  type DefenseSession,
  type DefenseReport,
  defenseSessionSchema,
  reportReferences,
} from '@defense/shared'
import {
  endedReportSession,
  reportFixture,
  reportOutputFixture,
} from '../../../../tests/fixtures/report.js'
import { createReportService } from '../services/report-service.js'
import { createDefenseService } from '../services/defense-service.js'
import { reportSourceFingerprint } from '../services/report-context.js'
import { buildDefenseContext } from '../services/defense-context.js'
import { createApp } from '../app.js'
function setup() {
  const source = endedReportSession(),
    records = new Map<string, DefenseSession>([[source.id, structuredClone(source)]])
  const report = { ...reportFixture(), sourceFingerprint: reportSourceFingerprint(source) }
  const repository = {
    async get(id: string) {
      return structuredClone(records.get(id) ?? null)
    },
    async save(session: DefenseSession) {
      records.set(session.id, structuredClone(session))
    },
  }
  const getReport = vi.fn(async () => report)
  const model = vi.fn()
  const service = createDefenseService(repository, model, { get: getReport, async save() {} })
  return { source, report, records, service, model, getReport }
}
describe('targeted retraining', () => {
  it('retains the selected training preferences in an independent retraining session', async () => {
    const env = setup()
    env.source.preferences = {style: 'guided', goal: 'users', questionLimit: 5}
    env.records.set(env.source.id, structuredClone(env.source))
    env.report.sourceFingerprint = reportSourceFingerprint(env.source)
    const session = await env.service.retrain(env.source.id, {requestId: crypto.randomUUID(), judgeId: 'user'})
    expect(session.preferences).toEqual(env.source.preferences)
    expect(session.assistance).toEqual([])
    expect(session.id).not.toBe(env.source.id)
    expect(session.messages).toEqual([])
  })
  it('finishes a new round, generates its own report and keeps the old report unchanged', async () => {
    const env = setup(),
      original = structuredClone(env.report)
    env.model.mockImplementation(async (_session, judgeId, _question, answer) => ({
      model: 'fixture-model',
      data: {
        question: {
          ...env.source.messages[0]!.question!,
          judgeId,
          question: answer
            ? `你提到「${answer}」，可以补充可核对的原始记录吗？`
            : '请说明旧报告中的访谈证据缺口准备怎样补充？',
        },
        assessment: answer
          ? {
              answerQuote: answer,
              evaluation: 'evidence_missing',
              feedback: '需要原始访谈记录。',
              nextStrategy: 'probe_evidence',
              risks: [],
            }
          : null,
      },
    }))
    const session = await env.service.retrain(env.source.id, {
      requestId: crypto.randomUUID(),
      judgeId: 'technical',
    })
    const first = await env.service.initial(session.id, crypto.randomUUID())
    const answered = await env.service.answer(session.id, {
      requestId: crypto.randomUUID(),
      questionId: first.currentQuestionId!,
      answer: '我已经整理匿名访谈提纲，下一步补充原始记录。',
    })
    const ended = await env.service.end(answered.id)
    const saved = new Map<string, DefenseReport>([[env.source.id, original]])
    const repository = {
      async get(id: string) {
        return saved.get(id) ?? null
      },
      async save(report: DefenseReport) {
        saved.set(report.sessionId, report)
      },
    }
    const calls = vi.fn()
    const service = createReportService(env.service, repository, {
      async generate(task) {
        calls()
        const output = reportOutputFixture(),
          answer = ended.messages.find((m) => m.sender === 'user')!
        for (const ref of reportReferences(output)) {
          ref.messageId = answer.id
          ref.quote = answer.content
        }
        return { data: task.schema.parse(output), model: 'fixture-model' }
      },
    })
    const report = await service.generate(ended.id)
    expect(report.sessionId).not.toBe(original.sessionId)
    expect(report.answerCount).toBe(1)
    expect(await service.generate(ended.id)).toEqual(report)
    expect(calls).toHaveBeenCalledTimes(1)
    expect(saved.get(original.sessionId)).toEqual(original)
  })
  it('creates a new immutable-project session with original report weaknesses and preserves the old record', async () => {
    const env = setup(),
      original = structuredClone(env.source),
      id = crypto.randomUUID()
    const next = await env.service.retrain(env.source.id, { requestId: id, judgeId: 'technical' })
    expect(next.id).toBe(id)
    expect(next.messages).toEqual([])
    expect(next.status).toBe('ready')
    expect(next.project).toEqual(original.project)
    expect(next.training?.focus[0]).toContain(env.report.output.weaknesses[0]!.detail)
    expect(defenseSessionSchema.safeParse(next).success).toBe(true)
    expect(buildDefenseContext(next, null, null, 'technical').retraining).toEqual(next.training)
    expect(env.records.get(original.id)).toEqual(original)
    expect(env.model).not.toHaveBeenCalled()
    expect(
      await env.service.retrain(env.source.id, { requestId: id, judgeId: 'technical' }),
    ).toEqual(next)
    await expect(
      env.service.retrain(env.source.id, { requestId: id, judgeId: 'business' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })
  it('rejects unfinished/demo sessions, missing report, source mismatch and reused original IDs', async () => {
    const env = setup(),
      input = { requestId: crypto.randomUUID(), judgeId: 'business' as const }
    await expect(
      env.service.retrain(env.source.id, { ...input, requestId: env.source.id }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    env.report.sourceFingerprint = 'a'.repeat(64)
    await expect(env.service.retrain(env.source.id, input)).rejects.toMatchObject({
      code: 'REPORT_SOURCE_MISMATCH',
    })
    env.getReport.mockResolvedValueOnce(null as never)
    await expect(env.service.retrain(env.source.id, input)).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    })
    env.records.get(env.source.id)!.status = 'awaiting_answer'
    await expect(env.service.retrain(env.source.id, input)).rejects.toMatchObject({
      code: 'RETRAIN_NOT_READY',
    })
    env.records.get(env.source.id)!.status = 'ended'
    env.records.get(env.source.id)!.mode = 'demo'
    await expect(env.service.retrain(env.source.id, input)).rejects.toMatchObject({
      code: 'RETRAIN_NOT_READY',
    })
  })
  it('accepts retraining HTTP requests and rejects invalid parameters before creation', async () => {
    const env = setup(),
      app = createApp({ defense: env.service }),
      url = `/api/v1/defense/sessions/${env.source.id}/retrain`
    const result = await request(app)
      .post(url)
      .send({ requestId: crypto.randomUUID(), judgeId: 'devil' })
      .expect(201)
    expect(result.body.data.training.sourceReportId).toBe(env.report.id)
    await request(app).post(url).send({ judgeId: 'unknown' }).expect(400)
    await request(app)
      .post('/api/defense/sessions/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/retrain')
      .send({ requestId: crypto.randomUUID(), judgeId: 'user' })
      .expect(404)
  })
  it('loads legacy sessions that have no training metadata', () => {
    const old = endedReportSession()
    delete old.training
    expect(defenseSessionSchema.safeParse(old).success).toBe(true)
    expect(buildDefenseContext(old, null, null, 'business').retraining).toBeNull()
  })
})
