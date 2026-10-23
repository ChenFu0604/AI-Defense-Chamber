import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  type DefenseSession,
  type DefenseReport,
  defenseSessionSchema,
  reportReferences,
  retrainRequestSchema,
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
import { createAttachmentService, type AttachmentService } from '../services/attachment-service.js'
import { createDefenseModel } from '../services/defense-model.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
function setup(attachments?: AttachmentService) {
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
  const service = createDefenseService(repository, model, { get: getReport, async save() {} }, attachments)
  return { source, report, records, service, model, getReport }
}
describe('targeted retraining', () => {
  it('validates actual task attachments and includes their text in the judge call without promoting completion to verified fact', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'defense-retraining-evidence-'))
    try {
      const attachments = createAttachmentService(directory), env = setup(attachments)
      const file = await attachments.upload(Buffer.from('INTERVIEW NOTE: three participants; payment willingness remains unknown.'), 'interviews.txt')
      const next = await env.service.retrain(env.source.id, {requestId: crypto.randomUUID(), judgeId: 'user',
        taskUpdates: [{improvementIndex: 0, status: 'done', note: '用户自行记录的进展', attachments: [file]}]})
      const generate = vi.fn(async (_task: {user: string}) => ({data: {question: {...env.source.messages[0]!.question!, judgeId: 'user', question: '这三次访谈中有哪些不同意见？'}, assessment: null}, model: 'fixture-model'}))
      const model = createDefenseModel({generate} as never, attachments)
      await model(next, 'user', null, null)
      const task = generate.mock.calls[0]![0]
      const context = JSON.parse(task.user)
      expect(context.materials[0].text).toContain('three participants')
      expect(context.retraining.tasks[0].source).toBe('user_progress_not_verified')
      expect(context.retraining.tasks[0].attachments[0]).not.toHaveProperty('text')
      expect(defenseSessionSchema.safeParse(next).success).toBe(true)
      await expect(env.service.retrain(env.source.id, {requestId: crypto.randomUUID(), judgeId: 'user',
        taskUpdates: [{improvementIndex: 0, status: 'todo', note: '', attachments: [{...file, name: 'forged.txt'}]}]})).rejects.toMatchObject({code: 'ATTACHMENT_MISMATCH'})
    } finally { await rm(directory, {recursive: true, force: true}) }
  })
  it('uses the selected updated project and real profile while preserving old records', async () => {
    const env = setup(), old = structuredClone(env.source), reportBefore = structuredClone(env.report)
    const project = {...env.source.project, technicalPlan: env.source.project.technicalPlan + ' 更新后的小范围原型方案。', updatedAt: '2026-10-23T01:00:00.000Z'}
    const analysis = {...env.source.analysis, id: crypto.randomUUID(), projectSnapshot: {...env.source.analysis.projectSnapshot, technicalPlan: project.technicalPlan}}
    const input = {requestId: crypto.randomUUID(), judgeId: 'technical' as const, current: {project, analysis},
      taskUpdates: [{improvementIndex: 0, status: 'done' as const, note: '已整理记录，但还需核对。'}]}
    const next = await env.service.retrain(env.source.id, input)
    expect(next.project).toEqual(project)
    expect(next.analysis).toEqual(analysis)
    expect(next.training?.projectSource).toBe('current')
    expect(next.training?.tasks?.[0]).toMatchObject({title: env.report.output.improvements[0]!.title, note: input.taskUpdates[0]!.note})
    expect(next.training?.focus).toHaveLength(1)
    const context = buildDefenseContext(next, null, null, 'technical')
    expect(context.project.technicalPlan).toBe(project.technicalPlan)
    expect(context.retraining?.tasks?.[0]).toMatchObject({source: 'user_progress_not_verified', status: 'done'})
    expect(await env.service.retrain(env.source.id, input)).toEqual(next)
    await expect(env.service.retrain(env.source.id, {...input, taskUpdates: [{...input.taskUpdates[0]!, note: '不同笔记'}]})).rejects.toMatchObject({code: 'IDEMPOTENCY_CONFLICT'})
    expect(env.records.get(old.id)).toEqual(old)
    expect(env.report).toEqual(reportBefore)
    expect(env.model).not.toHaveBeenCalled()
    expect(defenseSessionSchema.safeParse(next).success).toBe(true)
  })
  it('rejects another project, a stale/mismatched profile, duplicate tasks and nonexistent suggestions', async () => {
    const env = setup(), input = {requestId: crypto.randomUUID(), judgeId: 'user' as const}
    await expect(env.service.retrain(env.source.id, {...input, current: {project: {...env.source.project, id: crypto.randomUUID()}, analysis: env.source.analysis}})).rejects.toMatchObject({code: 'RETRAIN_PROJECT_MISMATCH'})
    const app = createApp({defense: env.service}), url = `/api/v1/defense/sessions/${env.source.id}/retrain`
    await request(app).post(url).send({...input, current: {project: {...env.source.project, technicalPlan: '已变化'}, analysis: env.source.analysis}}).expect(400)
    const task = {improvementIndex: 0, status: 'todo', note: ''}
    await request(app).post(url).send({...input, taskUpdates: [task, task]}).expect(400)
    await request(app).post(url).send({...input, taskUpdates: [{...task, improvementIndex: 7}]}).expect(400)
    expect(retrainRequestSchema.safeParse({...input, taskUpdates: [{...task, status: 'verified'}]}).success).toBe(false)
    expect(env.records.size).toBe(1)
  })
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
