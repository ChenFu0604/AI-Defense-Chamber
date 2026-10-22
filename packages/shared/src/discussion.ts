import { z } from 'zod'

export const discussionTopicIds = ['needs', 'solution', 'value', 'assumptions'] as const
export const discussionTopicIdSchema = z.enum(discussionTopicIds)
export type DiscussionTopicId = z.infer<typeof discussionTopicIdSchema>
export const MAX_TOPIC_QUESTIONS = 2
export const discussionStatusSchema = z.enum(['pending', 'discussing', 'clarified', 'awaiting_evidence', 'paused'])
export type DiscussionStatus = z.infer<typeof discussionStatusSchema>
export const discussionStatusLabels = {pending: '待讨论', discussing: '讨论中', clarified: '已澄清', awaiting_evidence: '待补证据', paused: '暂缓'} as const
export const discussionTopicLabels = {needs: '谁需要这个项目', solution: '核心功能怎么实现', value: '项目有什么价值', assumptions: '哪些假设还没验证'} as const
export const discussionMemorySchema = z.strictObject({
  version: z.literal(1), revision: z.number().int().min(0), currentTopicId: discussionTopicIdSchema.nullable(),
  topics: z.array(z.strictObject({
    id: discussionTopicIdSchema, title: z.string().min(1).max(100), status: discussionStatusSchema,
    source: z.enum(['program', 'ai', 'user']), note: z.string().max(1200),
    questionIds: z.array(z.uuid()).max(30), budgetStart: z.number().int().min(0),
    observations: z.array(z.strictObject({answerId: z.uuid(), questionId: z.uuid(), quote: z.string().min(1).max(200), summary: z.string().min(1).max(1200)})).max(30),
  })).length(4),
  edits: z.array(z.strictObject({requestId: z.uuid(), topicId: discussionTopicIdSchema, status: discussionStatusSchema, note: z.string().min(1).max(500), createdAt: z.iso.datetime()})).max(40),
})
export type DiscussionMemory = z.infer<typeof discussionMemorySchema>
export const topicStateRequestSchema = z.strictObject({
  requestId: z.uuid(), expectedRevision: z.number().int().min(0), topicId: discussionTopicIdSchema,
  status: z.enum(['pending', 'clarified', 'awaiting_evidence', 'paused']), note: z.string().trim().min(1).max(500),
})
export type TopicStateRequest = z.infer<typeof topicStateRequestSchema>
export const topicQuestionRequestSchema = z.strictObject({
  requestId: z.uuid(), questionId: z.uuid(), topicId: discussionTopicIdSchema, expectedRevision: z.number().int().min(0),
})
export type TopicQuestionRequest = z.infer<typeof topicQuestionRequestSchema>

interface LinkedSession {
  discussion?: DiscussionMemory
  currentQuestionId: string | null
  messages: {id: string; sender: string; content: string; replyTo: string | null; topicId?: DiscussionTopicId}[]
  completed: {requestId: string}[]
}
export function discussionLinksAreValid(session: LinkedSession) {
  const memory = session.discussion
  if (!memory) return !session.messages.some(v => v.topicId)
  if (new Set(memory.topics.map(t => t.id)).size !== 4) return false
  const current = session.messages.find(m => m.id === session.currentQuestionId)
  if ((current?.topicId ?? null) !== memory.currentTopicId) return false
  if (session.messages.some(m => !m.topicId || (m.sender === 'user' &&
    session.messages.find(q => q.id === m.replyTo && q.sender === 'judge')?.topicId !== m.topicId))) return false
  for (const topic of memory.topics) {
    const questions = session.messages.filter(m => m.sender === 'judge' && m.topicId === topic.id).map(m => m.id)
    if (JSON.stringify(questions) !== JSON.stringify(topic.questionIds) || topic.budgetStart > questions.length ||
      questions.length - topic.budgetStart > MAX_TOPIC_QUESTIONS ||
      new Set(topic.observations.map(o => o.answerId)).size !== topic.observations.length) return false
    if (topic.observations.some(o => !questions.includes(o.questionId) || !session.messages.some(a =>
      a.id === o.answerId && a.sender === 'user' && a.replyTo === o.questionId && a.content.includes(o.quote)))) return false
  }
  return new Set(memory.edits.map(e => e.requestId)).size === memory.edits.length &&
    memory.edits.every(e => session.completed.some(c => c.requestId === e.requestId))
}

export function discussionSummary(session: LinkedSession) {
  if (!session.discussion) return null
  const topics = session.discussion.topics
  const observed = new Set(topics.flatMap(t => t.observations.map(o => o.answerId)))
  return {
    clarified: topics.filter(t => t.status === 'clarified'),
    evidence: topics.filter(t => t.status === 'awaiting_evidence'),
    unfinished: topics.filter(t => ['paused', 'discussing'].includes(t.status) || (t.status === 'pending' && t.questionIds.length > 0)),
    uncovered: topics.filter(t => t.questionIds.length === 0),
    unassessedAnswers: session.messages.filter(m => m.sender === 'user' && !observed.has(m.id)).map(m => m.id),
  }
}
