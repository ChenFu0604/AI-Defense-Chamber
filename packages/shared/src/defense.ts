import { z } from 'zod'
import { attachmentListSchema } from './attachments.js'
import { judgeIds, judgeQuestionSchema, type JudgeDefinition } from './judges.js'
import { projectSchema } from './project.js'
import { analysisRecordSchema, analysisMatchesProject } from './analysis.js'
import { trainingPreferencesSchema, assistanceRecordSchema, assistanceRequestSchema, trainingSettings } from './training.js'
import { discussionMemorySchema, discussionTopicIdSchema, discussionLinksAreValid, topicQuestionRequestSchema, topicStateRequestSchema } from './discussion.js'
import { retrainingTaskSchema, retrainingTaskUpdatesSchema } from './improvements.js'

export const MAX_DEFENSE_QUESTIONS = 30
export const retrainingFocusSchema = z.strictObject({
  sourceSessionId: z.uuid(),
  sourceReportId: z.uuid(),
  focus: z.array(z.string().trim().min(1).max(1500)).min(1).max(5),
  projectSource: z.enum(['original', 'current']).optional(),
  sourceProjectUpdatedAt: z.iso.datetime().optional(),
  tasks: z.array(retrainingTaskSchema).max(5).optional(),
})
export const retrainRequestSchema = z.strictObject({
  requestId: z.uuid(),
  judgeId: z.enum(judgeIds),
  current: z.strictObject({ project: projectSchema, analysis: analysisRecordSchema }).optional(),
  taskUpdates: retrainingTaskUpdatesSchema.optional(),
}).superRefine((value, context) => {
  if (value.current && (value.current.analysis.mode !== 'live' || !analysisMatchesProject(value.current.analysis, value.current.project)))
    context.addIssue({code: 'custom', message: '复训资料需要匹配当前项目的真实画像。'})
})
export type RetrainRequest = z.infer<typeof retrainRequestSchema>
const text = (max: number) => z.string().trim().min(1).max(max)
export type JudgeRole = JudgeDefinition
export type DefenseQuestion = z.infer<typeof judgeQuestionSchema>
export const answerAssessmentSchema = z.strictObject({
  answerQuote: text(200),
  evaluation: z.enum(['evidence_missing', 'sufficient', 'unclear']),
  feedback: text(1200),
  nextStrategy: z.enum(['probe_evidence', 'test_boundary', 'change_direction']),
  risks: z
    .array(z.strictObject({ title: text(200), severity: z.enum(['low', 'medium', 'high']) }))
    .max(4),
})
export const defenseTurnSchema = z.strictObject({
  question: judgeQuestionSchema,
  assessment: answerAssessmentSchema.nullable(),
})
export const discussionTurnSchema = defenseTurnSchema.extend({
  question: judgeQuestionSchema.nullable(), topicId: discussionTopicIdSchema.nullable(),
})
export const defenseMessageSchema = z.strictObject({
  id: z.uuid(),
  sender: z.enum(['user', 'judge']),
  content: text(4000),
  createdAt: z.iso.datetime(),
  judgeId: z.enum(judgeIds),
  status: z.enum(['sent', 'pending', 'failed', 'answered', 'superseded']),
  question: judgeQuestionSchema.nullable(),
  assessment: answerAssessmentSchema.nullable(),
  replyTo: z.uuid().nullable(),
  requestId: z.uuid(),
  model: text(200).nullable(),
  attachments: attachmentListSchema.optional(),
  topicId: discussionTopicIdSchema.optional(),
})
export type DefenseMessage = z.infer<typeof defenseMessageSchema>
export const defenseStatusSchema = z.enum([
  'ready',
  'generating',
  'awaiting_answer',
  'failed',
  'ended',
])
export type DefenseStatus = z.infer<typeof defenseStatusSchema>
export const pendingDefenseActionSchema = z.strictObject({
  requestId: z.uuid(),
  fingerprint: text(64),
  type: z.enum(['initial', 'answer', 'switch', 'topic']),
  questionId: z.uuid().nullable(),
  judgeId: z.enum(judgeIds),
  answerMessageId: z.uuid().nullable(),
  topicId: discussionTopicIdSchema.optional(),
  expectedRevision: z.number().int().min(0).optional(),
})
export const defenseSessionSchema = z
  .strictObject({
    id: z.uuid(),
    project: projectSchema,
    analysis: analysisRecordSchema,
    mode: z.enum(['live', 'demo']),
    currentJudgeId: z.enum(judgeIds),
    currentQuestionId: z.uuid().nullable(),
    status: defenseStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullable(),
    messages: z.array(defenseMessageSchema).max(100),
    pending: pendingDefenseActionSchema.nullable(),
    completed: z.array(z.strictObject({ requestId: z.uuid(), fingerprint: text(64) })).max(100),
    createFingerprint: text(64),
    error: z.strictObject({ code: text(100), message: text(1200) }).nullable(),
    training: retrainingFocusSchema.nullable().optional(),
    preferences: trainingPreferencesSchema.optional(),
    discussion: discussionMemorySchema.optional(),
    assistance: z.array(assistanceRecordSchema).max(90).optional(),
    closingFeedback: z.strictObject({
      answerMessageId: z.uuid(), assessment: answerAssessmentSchema,
      model: text(200).nullable(),
    }).optional(),
  })
  .superRefine((session, context) => {
    const current = session.messages.find((v) => v.id === session.currentQuestionId)
    const pendingAnswer = session.messages.find((v) => v.id === session.pending?.answerMessageId)
    if (
      session.analysis.mode !== session.mode ||
      !discussionLinksAreValid(session) ||
      !analysisMatchesProject(session.analysis, session.project) ||
      (session.currentQuestionId !== null &&
        (!current?.question || current.judgeId !== session.currentJudgeId)) ||
      (session.status === 'awaiting_answer' && !current?.question) ||
      (['generating', 'failed'].includes(session.status) && !session.pending) ||
      (session.status === 'ended' && !session.endedAt) ||
      (session.status === 'ready' && (session.messages.length > 0 || session.pending !== null)) ||
      (session.pending?.type === 'answer' &&
        (!session.pending.questionId ||
          pendingAnswer?.sender !== 'user' ||
          pendingAnswer.requestId !== session.pending.requestId)) ||
      (['switch', 'topic'].includes(session.pending?.type ?? '') && !session.pending?.questionId) ||
      (session.pending?.type === 'topic' && (!session.discussion || !session.pending.topicId || session.pending.expectedRevision === undefined)) ||
      new Set(session.completed.map((v) => v.requestId)).size !== session.completed.length ||
      session.messages.filter((v) => v.sender === 'judge').length > trainingSettings(session).questionLimit ||
      new Set(session.assistance?.map((v) => v.requestId)).size !== (session.assistance?.length ?? 0) ||
      new Set(session.assistance?.map((v) => `${v.questionId}:${v.kind}`)).size !== (session.assistance?.length ?? 0) ||
      session.assistance?.some((v) => {
        const question = session.messages.find((m) => m.id === v.questionId && m.sender === 'judge')
        return !question || question.judgeId !== v.judgeId || v.mode !== session.mode ||
          (v.mode === 'demo' ? v.model !== null : v.model === null) ||
          session.completed.some((c) => c.requestId === v.requestId) || session.pending?.requestId === v.requestId
      }) ||
      (session.closingFeedback && (() => {
        const answer = session.messages.find((m) => m.id === session.closingFeedback!.answerMessageId && m.sender === 'user')
        return session.status !== 'ended' || !answer?.content.includes(session.closingFeedback.assessment.answerQuote) ||
          (session.mode === 'demo' ? session.closingFeedback.model !== null : session.closingFeedback.model === null)
      })()) ||
      new Set(session.messages.map((v) => v.id)).size !== session.messages.length ||
      session.messages.some((v) =>
        v.sender === 'judge'
          ? !v.question ||
            v.question.question !== v.content ||
            v.question.judgeId !== v.judgeId ||
            (session.mode === 'demo' ? v.model !== null : v.model === null)
          : v.question !== null || v.model !== null || v.assessment !== null,
      )
    )
      context.addIssue({ code: 'custom', message: '会话来源、状态或消息关联不一致。' })
  })
export type DefenseSession = z.infer<typeof defenseSessionSchema>
export const createDefenseRequestSchema = z
  .strictObject({
    requestId: z.uuid(),
    project: projectSchema,
    analysis: analysisRecordSchema,
    mode: z.enum(['live', 'demo']).default('live'),
    judgeId: z.enum(judgeIds).default('business'),
    preferences: trainingPreferencesSchema.optional(),
  })
  .superRefine((request, context) => {
    if (
      !analysisMatchesProject(request.analysis, request.project) ||
      request.analysis.mode !== request.mode
    )
      context.addIssue({
        code: 'custom',
        message: '项目、画像与调用模式不一致，请重新分析或选择对应模式。',
      })
  })
export type CreateDefenseRequest = z.infer<typeof createDefenseRequestSchema>
export const initialQuestionRequestSchema = z.strictObject({ requestId: z.uuid() })
export const answerRequestSchema = z.strictObject({
  requestId: z.uuid(),
  questionId: z.uuid(),
  answer: text(4000),
  attachments: attachmentListSchema.optional(),
})
export type AnswerRequest = z.infer<typeof answerRequestSchema>
export const switchJudgeRequestSchema = z.strictObject({
  requestId: z.uuid(),
  questionId: z.uuid(),
  judgeId: z.enum(judgeIds),
})
export type SwitchJudgeRequest = z.infer<typeof switchJudgeRequestSchema>
export const defenseResponseSchema = z.strictObject({
  success: z.literal(true),
  data: defenseSessionSchema,
})
export type AnswerResponse = z.infer<typeof defenseResponseSchema>
export const defenseOperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('question'), body: initialQuestionRequestSchema }),
  z.object({ kind: z.literal('answer'), body: answerRequestSchema }),
  z.object({ kind: z.literal('judge'), body: switchJudgeRequestSchema }),
  z.object({ kind: z.literal('help'), body: assistanceRequestSchema }),
  z.object({ kind: z.literal('topic'), body: topicQuestionRequestSchema }),
  z.object({ kind: z.literal('topic-state'), body: topicStateRequestSchema }),
])
export type DefenseOperation = z.infer<typeof defenseOperationSchema>
export const defenseStatusLabels: Record<DefenseStatus, string> = {
  ready: '等待首问',
  generating: '生成中',
  awaiting_answer: '等待回答',
  failed: '生成失败，可重试',
  ended: '已结束',
}
export const answerEvaluationLabels = {
  evidence_missing: '需要补充证据',
  sufficient: '当前回答较充分',
  unclear: '需要澄清',
} as const
