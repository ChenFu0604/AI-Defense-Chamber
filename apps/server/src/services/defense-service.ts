import { createHash, randomUUID } from 'node:crypto'
import {
  MAX_DEFENSE_QUESTIONS,
  retrainingFocusSchema,
  reportEvidenceIsValid,
  type RetrainRequest,
  type DefenseSession,
  type CreateDefenseRequest,
  type AnswerRequest,
  type SwitchJudgeRequest,
  type JudgeId,
} from '@defense/shared'
import { AppError } from '../middleware/app-error.js'
import { createDefenseRepository, type DefenseRepository } from './defense-repository.js'
import { createDefenseModel } from './defense-model.js'

import { createReportRepository, type ReportRepository } from './report-repository.js'
import { reportSourceFingerprint } from './report-context.js'
import { attachmentService, type AttachmentService } from './attachment-service.js'
import type { Attachment } from '@defense/shared'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function createDefenseService(
  repository: DefenseRepository = createDefenseRepository(),
  model = createDefenseModel(),
  reports: ReportRepository = createReportRepository(),
  attachments: AttachmentService = attachmentService,
) {
  const locks = new Set<string>()
  async function lock<T>(id: string, task: () => Promise<T>) {
    if (locks.has(id))
      throw new AppError(409, 'SESSION_BUSY', '该会话正在处理请求，请稍后刷新状态。')
    locks.add(id)
    try {
      return await task()
    } finally {
      locks.delete(id)
    }
  }
  async function read(id: string) {
    const session = await repository.get(id)
    if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', '答辩会话不存在，请返回准备页。')
    return session
  }
  async function save(session: DefenseSession) {
    session.updatedAt = new Date().toISOString()
    await repository.save(session)
    return session
  }
  function assertOpen(session: DefenseSession) {
    if (session.status === 'ended')
      throw new AppError(409, 'SESSION_ENDED', '答辩已结束，不能继续回答或切换评委。')
  }
  function questionCount(session: DefenseSession) {
    return session.messages.filter((v) => v.sender === 'judge').length
  }
  async function execute(
    id: string,
    type: 'initial' | 'answer' | 'switch',
    payload: {
      requestId: string
      questionId?: string
      answer?: string
      judgeId?: JudgeId
      attachments?: Attachment[]
    },
  ) {
    return lock(id, async () => {
      const session = await read(id),
        fingerprint = hash({ type, ...payload })
      const done = session.completed.find((v) => v.requestId === payload.requestId)
      if (done) {
        if (done.fingerprint !== fingerprint)
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', '请求 ID 已用于其他内容，请刷新会话。')
        return session
      }
      assertOpen(session)
      if (session.pending) {
        if (
          session.pending.requestId !== payload.requestId ||
          session.pending.fingerprint !== fingerprint
        )
          throw new AppError(409, 'PENDING_ACTION', '上次操作已保存，请先重试该操作或结束答辩。')
      } else {
        if (type === 'answer') await attachments.validate(payload.attachments)
        if (type === 'initial' && session.currentQuestionId)
          throw new AppError(409, 'QUESTION_EXISTS', '首问已生成，请刷新会话。')
        if (
          type !== 'initial' &&
          (!session.currentQuestionId || session.currentQuestionId !== payload.questionId)
        )
          throw new AppError(409, 'STALE_QUESTION', '当前问题已变化，请刷新后回答。')
        if (type !== 'answer' && questionCount(session) >= MAX_DEFENSE_QUESTIONS)
          throw new AppError(409, 'TURN_LIMIT', '已达问题上限，请回答当前问题或结束答辩。')
        const judgeId = payload.judgeId ?? session.currentJudgeId
        if (type === 'switch' && judgeId === session.currentJudgeId)
          throw new AppError(409, 'SAME_JUDGE', '该评委已在提问。')
        const answerMessageId = type === 'answer' ? randomUUID() : null
        if (answerMessageId)
          session.messages.push({
            id: answerMessageId,
            sender: 'user',
            content: payload.answer!,
            createdAt: new Date().toISOString(),
            judgeId: session.currentJudgeId,
            status: 'pending',
            question: null,
            assessment: null,
            replyTo: session.currentQuestionId,
            requestId: payload.requestId,
            model: null,
            ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
          })
        session.pending = {
          requestId: payload.requestId,
          fingerprint,
          type,
          questionId: session.currentQuestionId,
          judgeId,
          answerMessageId,
        }
      }
      session.status = 'generating'
      session.error = null
      if (session.pending.answerMessageId)
        session.messages.find((v) => v.id === session.pending!.answerMessageId)!.status = 'pending'
      await save(session)
      try {
        const action = session.pending!
        const previousQuestion = session.messages.find((v) => v.id === session.currentQuestionId)
        const latestAnswer = action.answerMessageId
          ? session.messages.find((v) => v.id === action.answerMessageId)!
          : session.messages.filter((v) => v.sender === 'user' && v.status === 'sent').at(-1)
        if (type === 'answer' && questionCount(session) >= MAX_DEFENSE_QUESTIONS) {
          session.status = 'ended'
          session.endedAt = new Date().toISOString()
        } else {
          const generated = await model(
            session,
            action.judgeId,
            previousQuestion?.question ?? null,
            latestAnswer?.content ?? null,
          )
          const messageId = randomUUID()
          session.messages.push({
            id: messageId,
            sender: 'judge',
            content: generated.data.question.question,
            createdAt: new Date().toISOString(),
            judgeId: action.judgeId,
            status: 'sent',
            question: generated.data.question,
            assessment: generated.data.assessment,
            replyTo: latestAnswer?.id ?? null,
            requestId: payload.requestId,
            model: generated.model,
          })
          session.currentQuestionId = messageId
          session.currentJudgeId = action.judgeId
          session.status = 'awaiting_answer'
        }
        if (previousQuestion)
          previousQuestion.status = type === 'switch' ? 'superseded' : 'answered'
        if (action.answerMessageId)
          session.messages.find((v) => v.id === action.answerMessageId)!.status = 'sent'
        session.completed.push({ requestId: payload.requestId, fingerprint })
        session.pending = null
        session.error = null
        return await save(session)
      } catch (failure) {
        // Reload the last confirmed write: never expose a generated but unsaved question as success.
        const persisted = await read(id)
        persisted.status = 'failed'
        persisted.error =
          failure instanceof AppError
            ? { code: failure.code, message: failure.message }
            : { code: 'DEFENSE_FAILED', message: '生成追问失败，已有回答保留，请重试。' }
        const message = persisted.messages.find((v) => v.id === persisted.pending?.answerMessageId)
        if (message) message.status = 'failed'
        await save(persisted)
        throw failure
      }
    })
  }
  async function create(request: CreateDefenseRequest, training?: DefenseSession['training']) {
    return lock(request.requestId, async () => {
      const existing = await repository.get(request.requestId),
        fingerprint = training ? hash({ request, training }) : hash(request)
      if (existing) {
        if (existing.createFingerprint !== fingerprint)
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', '创建请求 ID 已用于不同项目资料。')
        return existing
      }
      await attachments.validate(request.project.attachments)
      const now = new Date().toISOString()
      const session: DefenseSession = {
        id: request.requestId,
        project: request.project,
        analysis: request.analysis,
        mode: request.mode,
        currentJudgeId: request.judgeId,
        currentQuestionId: null,
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        endedAt: null,
        messages: [],
        pending: null,
        completed: [],
        createFingerprint: fingerprint,
        error: null,
        training: training ?? null,
      }
      return save(session)
    })
  }
  return {
    create,
    async retrain(id: string, input: RetrainRequest) {
      const source = await read(id)
      if (source.status !== 'ended' || source.mode !== 'live')
        throw new AppError(409, 'RETRAIN_NOT_READY', '二次训练需要已结束的真实会话及其评分报告。')
      if (id === input.requestId)
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', '新训练必须使用新的会话 ID。')
      const report = await reports.get(id)
      if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', '请先生成并保存原会话的评分报告。')
      if (
        report.projectId !== source.project.id ||
        report.sessionId !== source.id ||
        report.sourceFingerprint !== reportSourceFingerprint(source) ||
        !reportEvidenceIsValid(report.output, source)
      )
        throw new AppError(
          409,
          'REPORT_SOURCE_MISMATCH',
          '历史报告与原会话记录不一致，未创建训练。',
        )
      const training = retrainingFocusSchema.parse({
        sourceSessionId: id,
        sourceReportId: report.id,
        focus: [
          ...report.output.weaknesses.slice(0, 2).map((item) => `${item.title}：${item.detail}`),
          ...report.output.improvements
            .slice(0, 2)
            .map((item) => `${item.title}：${item.action} 完成标准：${item.acceptanceCriteria}`),
        ].map((item) => item.slice(0, 1500)),
      })
      return create(
        {
          requestId: input.requestId,
          project: source.project,
          analysis: source.analysis,
          mode: source.mode,
          judgeId: input.judgeId,
        },
        training,
      )
    },
    async get(id: string) {
      const session = await read(id)
      if (session.status === 'generating' && !locks.has(id))
        return lock(id, async () => {
          const latest = await read(id)
          if (latest.status === 'generating') {
            latest.status = 'failed'
            latest.error = {
              code: 'REQUEST_INTERRUPTED',
              message: '服务重启或上次请求中断，已保存的操作可以重试。',
            }
            const message = latest.messages.find((v) => v.id === latest.pending?.answerMessageId)
            if (message) message.status = 'failed'
            return save(latest)
          }
          return latest
        })
      return session
    },
    initial: (id: string, requestId: string) => execute(id, 'initial', { requestId }),
    answer: (id: string, payload: AnswerRequest) => {
      const { attachments: files, ...body } = payload
      return execute(id, 'answer', { ...body, ...(files?.length ? { attachments: files } : {}) })
    },
    switchJudge: (id: string, payload: SwitchJudgeRequest) => execute(id, 'switch', payload),
    async end(id: string) {
      return lock(id, async () => {
        const session = await read(id)
        if (session.status === 'ended') return session
        session.status = 'ended'
        session.endedAt = new Date().toISOString()
        session.pending = null
        for (const message of session.messages)
          if (message.status === 'pending') message.status = 'failed'
        return save(session)
      })
    },
  }
}
export type DefenseService = ReturnType<typeof createDefenseService>
export const defenseService = createDefenseService()
