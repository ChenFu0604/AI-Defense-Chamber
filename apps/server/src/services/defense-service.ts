import { createHash, randomUUID } from 'node:crypto'
import {
  reportEvidenceIsValid,
  type RetrainRequest,
  type DefenseSession,
  type CreateDefenseRequest,
  type AnswerRequest,
  type SwitchJudgeRequest,
  type JudgeId,
  type AssistanceRequest,
  trainingSettings,
  type TopicStateRequest, type TopicQuestionRequest,
  type DiscussionTopicId,
} from '@defense/shared'
import { AppError } from '../middleware/app-error.js'
import { createDefenseRepository, type DefenseRepository } from './defense-repository.js'
import { createDefenseModel } from './defense-model.js'

import { createReportRepository, type ReportRepository } from './report-repository.js'
import { buildRetrainingPlan } from './retraining-plan.js'
import { reportSourceFingerprint } from './report-context.js'
import { attachmentService, type AttachmentService } from './attachment-service.js'
import type { Attachment } from '@defense/shared'
import { createAssistanceModel, createClosingAssessmentModel } from './defense-guidance.js'
import { createDiscussionMemory, recordDiscussionAssessment, attachDiscussionQuestion, finishDiscussion, availableTopics } from './defense-discussion.js'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function createDefenseService(
  repository: DefenseRepository = createDefenseRepository(),
  model = createDefenseModel(),
  reports: ReportRepository = createReportRepository(),
  attachments: AttachmentService = attachmentService,
  guidance: { assistance?: ReturnType<typeof createAssistanceModel>; closing?: ReturnType<typeof createClosingAssessmentModel> } = {},
) {
  const assist = guidance.assistance ?? createAssistanceModel()
  const assessClosing = guidance.closing ?? createClosingAssessmentModel(undefined, attachments)
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
    type: 'initial' | 'answer' | 'switch' | 'topic',
    payload: {
      requestId: string
      questionId?: string
      answer?: string
      judgeId?: JudgeId
      attachments?: Attachment[]
      topicId?: DiscussionTopicId
      expectedRevision?: number
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
      if (session.assistance?.some((v) => v.requestId === payload.requestId))
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', '请求 ID 已用于提示，请使用原操作重试。')
      if (session.pending) {
        if (
          session.pending.requestId !== payload.requestId ||
          session.pending.fingerprint !== fingerprint
        )
          throw new AppError(409, 'PENDING_ACTION', '上次操作已保存，请先重试该操作或结束答辩。')
      } else {
        if (type === 'topic') {
          if (!session.discussion) throw new AppError(409, 'TOPICS_UNAVAILABLE', '旧会话没有议题进度，请新建训练使用。')
          if (session.discussion.revision !== payload.expectedRevision) throw new AppError(409, 'STALE_TOPIC', '议题状态已更新，请刷新后核对。')
          const topic = session.discussion.topics.find(t => t.id === payload.topicId)
          if (!topic) throw new AppError(400, 'VALIDATION_ERROR', '议题不存在。')
          if (topic.id === session.discussion.currentTopicId && topic.status === 'discussing') throw new AppError(409, 'SAME_TOPIC', '这个议题正在讨论，可先回答当前问题。')
        }
        if (type === 'answer') await attachments.validate(payload.attachments)
        if (type === 'initial' && session.currentQuestionId)
          throw new AppError(409, 'QUESTION_EXISTS', '首问已生成，请刷新会话。')
        if (
          type !== 'initial' &&
          (!session.currentQuestionId || session.currentQuestionId !== payload.questionId)
        )
          throw new AppError(409, 'STALE_QUESTION', '当前问题已变化，请刷新后回答。')
        if (type !== 'answer' && questionCount(session) >= trainingSettings(session).questionLimit)
          throw new AppError(409, 'TURN_LIMIT', '已达问题上限，请回答当前问题或结束答辩。')
        const judgeId = payload.judgeId ?? session.currentJudgeId
        if (type === 'switch' && judgeId === session.currentJudgeId)
          throw new AppError(409, 'SAME_JUDGE', '该评委已在提问。')
        if (type === 'switch' && session.discussion && !availableTopics(session).length)
          throw new AppError(409, 'TOPIC_REOPEN_REQUIRED', '没有可自动提问的议题。请重新讨论某个议题、回答当前问题或结束训练。')
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
            ...(session.discussion ? {topicId: session.discussion.currentTopicId!} : {}),
          })
        session.pending = {
          requestId: payload.requestId,
          fingerprint,
          type,
          questionId: session.currentQuestionId,
          judgeId,
          answerMessageId,
          ...(type === 'topic' ? {topicId: payload.topicId, expectedRevision: payload.expectedRevision} : {}),
        }
        if (type === 'topic') {
          const topic = session.discussion!.topics.find(t => t.id === payload.topicId)!
          topic.budgetStart = topic.questionIds.length
          topic.status = 'pending'; topic.source = 'user'; topic.note = '用户主动选择重新讨论。'
          session.discussion!.revision++
        }
      }
      session.status = 'generating'
      // Preserve the last validation failure during a retry so the model can correct it.
      if (session.pending.answerMessageId)
        session.messages.find((v) => v.id === session.pending!.answerMessageId)!.status = 'pending'
      await save(session)
      try {
        const action = session.pending!
        const previousQuestion = session.messages.find((v) => v.id === session.currentQuestionId)
        const latestAnswer = action.answerMessageId
          ? session.messages.find((v) => v.id === action.answerMessageId)!
          : session.discussion ? undefined : session.messages.filter((v) => v.sender === 'user' && v.status === 'sent').at(-1)
        if (type === 'answer' && questionCount(session) >= trainingSettings(session).questionLimit) {
          // New finite training evaluates its last answer without creating an extra question.
          // Legacy sessions keep their original final-answer behavior.
          if (session.preferences && latestAnswer) {
            const feedback = await assessClosing(session, latestAnswer)
            session.closingFeedback = { answerMessageId: latestAnswer.id, assessment: feedback.data, model: feedback.model, ...('retrieval' in feedback && feedback.retrieval ? {retrieval: feedback.retrieval} : {}) }
            recordDiscussionAssessment(session, latestAnswer, feedback.data)
          }
          session.status = 'ended'
          session.endedAt = new Date().toISOString()
        } else {
          const generated = await model(
            session,
            action.judgeId,
            previousQuestion?.question ?? null,
            latestAnswer?.content ?? null,
          )
          if (session.discussion && type === 'answer' && latestAnswer && generated.data.assessment)
            recordDiscussionAssessment(session, latestAnswer, generated.data.assessment)
          const topicId = 'topicId' in generated.data ? generated.data.topicId : null
          if (session.discussion && generated.data.question && (!topicId || !availableTopics(session, generated.data.assessment).includes(topicId)))
            throw new AppError(502, 'AI_INVALID_TOPIC', '生成的问题未对应可用议题，回答已保留。')
          if (!generated.data.question) {
            if (!session.discussion || topicId !== null || type !== 'answer' || !latestAnswer || !generated.data.assessment || availableTopics(session, generated.data.assessment).length)
              throw new AppError(502, 'AI_INVALID_TOPIC', '议题尚未完成，不能跳过提问或虚构小结。')
            session.closingFeedback = {answerMessageId: latestAnswer.id, assessment: generated.data.assessment, model: generated.model, ...('retrieval' in generated && generated.retrieval ? {retrieval: generated.retrieval} : {})}
            session.status = 'ended'; session.endedAt = new Date().toISOString()
          } else {
            const messageId = randomUUID()
            const message: DefenseSession['messages'][number] = {
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
              ...('retrieval' in generated && generated.retrieval ? {retrieval: generated.retrieval} : {}),
            }
            if (session.discussion) attachDiscussionQuestion(session, message, topicId!)
            session.messages.push(message)
            session.currentQuestionId = messageId
            session.currentJudgeId = action.judgeId
            session.status = 'awaiting_answer'
          }
        }
        if (previousQuestion)
          previousQuestion.status = type === 'switch' || type === 'topic' ? 'superseded' : 'answered'
        if (action.answerMessageId)
          session.messages.find((v) => v.id === action.answerMessageId)!.status = 'sent'
        session.completed.push({ requestId: payload.requestId, fingerprint })
        session.pending = null
        session.error = null
        if (session.status === 'ended') finishDiscussion(session)
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
        ...(request.preferences ? { preferences: request.preferences, assistance: [] } : {}),
        ...(request.preferences ? {discussion: createDiscussionMemory()} : {}),
      }
      return save(session)
    })
  }
  return {
    create,
    async updateTopic(id: string, input: TopicStateRequest) {
      return lock(id, async () => {
        const session = await read(id), fingerprint = hash({type: 'topic-state', ...input})
        const done = session.completed.find(c => c.requestId === input.requestId)
        if (done) {
          if (done.fingerprint !== fingerprint) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', '请求 ID 已用于不同操作。')
          return session
        }
        assertOpen(session)
        if (session.pending || session.status !== 'awaiting_answer') throw new AppError(409, 'PENDING_ACTION', '请先完成当前请求再更正议题。')
        if (session.assistance?.some(h => h.requestId === input.requestId)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', '请求 ID 已用于求助。')
        const memory = session.discussion
        if (!memory) throw new AppError(409, 'TOPICS_UNAVAILABLE', '旧会话没有议题进度，请新建训练使用。')
        if (memory.revision !== input.expectedRevision) throw new AppError(409, 'STALE_TOPIC', '其他页面已更新议题，请刷新核对。')
        if (memory.edits.length >= 40) throw new AppError(409, 'TOPIC_EDIT_LIMIT', '本场已达议题更正次数上限，记录仍可查看。')
        const topic = memory.topics.find(t => t.id === input.topicId)!
        topic.status = input.status; topic.source = 'user'; topic.note = input.note
        if (input.status === 'pending') topic.budgetStart = topic.questionIds.length
        memory.revision++
        memory.edits.push({requestId: input.requestId, topicId: input.topicId, status: input.status, note: input.note, createdAt: new Date().toISOString()})
        session.completed.push({requestId: input.requestId, fingerprint})
        return save(session)
      })
    },
    changeTopic: (id: string, input: TopicQuestionRequest) => execute(id, 'topic', input),
    async help(id: string, input: AssistanceRequest) {
      return lock(id, async () => {
        const session = await read(id)
        const existing = session.assistance?.find((v) => v.requestId === input.requestId)
        if (existing) {
          if (existing.questionId !== input.questionId || existing.kind !== input.kind)
            throw new AppError(409, 'IDEMPOTENCY_CONFLICT', '提示请求 ID 已用于其他内容。')
          return session
        }
        assertOpen(session)
        if (session.completed.some((v) => v.requestId === input.requestId) || session.pending?.requestId === input.requestId)
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', '请求 ID 已用于答辩操作。')
        if (session.pending || session.status !== 'awaiting_answer')
          throw new AppError(409, 'PENDING_ACTION', '请先完成或重试当前答辩操作，再获取提示。')
        if (session.currentQuestionId !== input.questionId)
          throw new AppError(409, 'STALE_QUESTION', '问题已变化，请刷新后查看当前问题。')
        if (session.assistance?.some((v) => v.questionId === input.questionId && v.kind === input.kind)) return session
        const generated = await assist(session, input)
        session.assistance = [...(session.assistance ?? []), {
          ...input, judgeId: session.currentJudgeId, content: generated.data.content,
          createdAt: new Date().toISOString(), mode: session.mode, model: generated.model,
        }]
        return save(session)
      })
    },
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
      const {project, analysis, training} = buildRetrainingPlan(source, report, input)
      for (const task of training.tasks ?? []) await attachments.validate(task.attachments)
      return create(
        {
          requestId: input.requestId,
          project,
          analysis,
          mode: source.mode,
          judgeId: input.judgeId,
          ...(source.preferences ? { preferences: source.preferences } : {}),
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
        finishDiscussion(session)
        return save(session)
      })
    },
  }
}
export type DefenseService = ReturnType<typeof createDefenseService>
export const defenseService = createDefenseService()
