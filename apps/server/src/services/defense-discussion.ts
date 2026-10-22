import {
  discussionTopicIds, discussionTopicLabels, MAX_TOPIC_QUESTIONS,
  type DiscussionMemory, type DiscussionTopicId, type DefenseSession, type DefenseMessage,
} from '@defense/shared'

type Assessment = NonNullable<DefenseMessage['assessment']>
export function createDiscussionMemory(): DiscussionMemory {
  return {version: 1, revision: 0, currentTopicId: null, edits: [], topics: discussionTopicIds.map(id => ({
    id, title: discussionTopicLabels[id], status: 'pending', source: 'program', note: '训练提纲，尚未讨论；不是项目风险结论。',
    questionIds: [], budgetStart: 0, observations: [],
  }))}
}
export function availableTopics(session: DefenseSession, assessment?: Assessment | null): DiscussionTopicId[] {
  const memory = session.discussion
  if (!memory) return []
  if (session.pending?.type === 'topic') return [session.pending.topicId!]
  return memory.topics.filter(topic => {
    const current = topic.id === memory.currentTopicId
    if (topic.questionIds.length - topic.budgetStart >= MAX_TOPIC_QUESTIONS) return false
    if (['clarified', 'paused'].includes(topic.status)) return false
    if (topic.status === 'awaiting_evidence' && (!current || topic.source === 'user')) return false
    if (current && session.assistance?.some(h => h.questionId === session.currentQuestionId && h.kind === 'no_evidence')) return false
    if (current && session.pending?.type === 'answer' && assessment &&
      (assessment.evaluation === 'sufficient' || assessment.nextStrategy === 'change_direction')) return false
    return true
  }).map(t => t.id)
}
export function discussionPlan(session: DefenseSession) {
  if (!session.discussion) return null
  const available = availableTopics(session)
  const goal = session.preferences?.goal
  const preferred: DiscussionTopicId = goal === 'users' ? 'needs' : goal === 'technical' ? 'solution' : goal === 'value' ? 'value'
    : ({business: 'value', technical: 'solution', user: 'needs', devil: 'assumptions'} as const)[session.pending?.judgeId ?? session.currentJudgeId]
  const current = session.discussion.currentTopicId
  return {
    maxQuestionsPerVisit: MAX_TOPIC_QUESTIONS, availableTopicIds: available,
    recommendedTopicId: current && available.includes(current) && session.pending?.type === 'answer' ? current
      : available.includes(preferred) ? preferred : available[0] ?? null,
    topics: session.discussion.topics.map(t => ({id: t.id, title: t.title, status: t.status, source: t.source, note: t.note.slice(0, 500),
      questionsThisVisit: t.questionIds.length - t.budgetStart,
      observations: t.observations.slice(-2).map(o => ({answerId: o.answerId, quote: o.quote, summary: o.summary.slice(0, 400)})),
    })),
    notice: '议题为训练提纲。状态和小结不是外部事实核验；用户更正优先。已澄清/暂缓的议题不自动重问，待补证据不反复索要。',
  }
}
export function recordDiscussionAssessment(session: DefenseSession, answer: DefenseMessage, assessment: Assessment) {
  const memory = session.discussion
  const topic = memory?.topics.find(t => t.id === answer.topicId)
  if (!memory || !topic) return
  if (!topic.observations.some(o => o.answerId === answer.id)) topic.observations.push({
    answerId: answer.id, questionId: answer.replyTo!, quote: assessment.answerQuote, summary: assessment.feedback,
  })
  if (!(topic.source === 'user' && ['clarified', 'awaiting_evidence', 'paused'].includes(topic.status))) {
    topic.status = assessment.evaluation === 'sufficient' ? 'clarified'
      : assessment.evaluation === 'evidence_missing' ? 'awaiting_evidence' : 'discussing'
    topic.note = assessment.feedback
    topic.source = session.mode === 'demo' ? 'program' : 'ai'
    if (topic.status === 'discussing' && topic.questionIds.length - topic.budgetStart >= MAX_TOPIC_QUESTIONS) {
      topic.status = 'paused'
      topic.note = '本次议题已达到两题上限，先记录待澄清内容。' + assessment.feedback.slice(0, 1100)
    }
    if (topic.status !== 'clarified' && session.assistance?.some(h => h.questionId === answer.replyTo && h.kind === 'no_evidence')) {
      topic.status = 'awaiting_evidence'
      topic.note = '用户表示暂时没有数据，保留待补证据项。' + assessment.feedback.slice(0, 1100)
    }
  }
  memory.revision++
}
export function attachDiscussionQuestion(session: DefenseSession, message: DefenseMessage, id: DiscussionTopicId) {
  const memory = session.discussion!
  const previous = memory.topics.find(t => t.id === memory.currentTopicId)
  if (previous && previous.id !== id && previous.status === 'discussing') {
    previous.status = 'paused'; previous.source = 'program'; previous.note = '已转向另一议题，原问题和回答保留，尚未认定已澄清。'
  }
  const topic = memory.topics.find(t => t.id === id)!
  if (topic.status === 'pending') {topic.status = 'discussing'; topic.source = 'program'; topic.note = '正在围绕本议题提问。'}
  message.topicId = id
  topic.questionIds.push(message.id)
  memory.currentTopicId = id
  memory.revision++
}
export function finishDiscussion(session: DefenseSession) {
  if (!session.discussion) return
  for (const topic of session.discussion.topics) if (topic.status === 'discussing') {
    topic.status = 'paused'; topic.source = 'program'
    topic.note = '会话已结束，本议题仍待澄清；未完成的评价不补造结论。'
  }
  session.discussion.revision++
}
