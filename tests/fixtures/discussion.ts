import { discussionTopicIds, discussionTopicLabels, type DefenseSession } from '@defense/shared'
/** Adds a program-created outline to an existing test session, never to user data. */
export function withDiscussion(record: DefenseSession): DefenseSession {
  const session = structuredClone(record)
  session.messages.forEach(m => {m.topicId = 'needs'})
  session.discussion = {version: 1, revision: 1, currentTopicId: session.currentQuestionId ? 'needs' : null, edits: [],
    topics: discussionTopicIds.map(id => ({id, title: discussionTopicLabels[id], status: id === 'needs' ? 'discussing' : 'pending',
      source: 'program', note: '测试提纲，尚未验证。', budgetStart: 0, observations: [],
      questionIds: id === 'needs' ? session.messages.filter(m => m.sender === 'judge').map(m => m.id) : [],
    }))}
  return session
}
