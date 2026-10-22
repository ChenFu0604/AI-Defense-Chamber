import type { DefenseSession } from '@defense/shared'

export function latestAnswerFeedback(session: DefenseSession | null, answering = false) {
  if (!session || answering || session.pending?.type === 'answer') return null
  const answer = session.messages.filter(v => v.sender === 'user').at(-1)
  if (!answer) return null
  if (session.closingFeedback?.answerMessageId === answer.id)
    return {assessment: session.closingFeedback.assessment, rationale: undefined}
  const question = session.messages.find(v => v.id === session.currentQuestionId)
  return question?.assessment && question.replyTo === answer.id
    ? {assessment: question.assessment, rationale: question.question?.rationale}
    : null
}
