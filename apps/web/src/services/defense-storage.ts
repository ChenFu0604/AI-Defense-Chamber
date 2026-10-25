import { z } from 'zod'
import {
  attachmentListSchema,
  defenseOperationSchema,
  defenseStatusSchema,
  type Attachment,
  type DefenseOperation,
  type DefenseSession,
} from '@defense/shared'

const recentSchema = z
  .array(
    z.object({
      id: z.uuid(),
      projectId: z.uuid(),
      name: z.string(),
      mode: z.enum(['live', 'demo']),
      createdAt: z.iso.datetime().optional(),
      updatedAt: z.iso.datetime().optional(),
      status: defenseStatusSchema.optional(),
      answerCount: z.number().int().min(0).max(100).optional(),
    }),
  )
  .max(20)
const draftSchema = z.object({
  answer: z.string().max(4000),
  operation: defenseOperationSchema.nullable(),
  attachments: attachmentListSchema.optional(),
})
export const DEFENSE_RECENT_KEY = 'defense-chamber.sessions.v1'
const draftKey = (id: string) => 'defense-chamber.draft.v1.' + id
export function recentDefenseSessions() {
  return recentSchema.parse(JSON.parse(localStorage.getItem(DEFENSE_RECENT_KEY) ?? '[]'))
}
export function rememberDefense(session: Pick<DefenseSession, 'id' | 'project' | 'mode'> &
  Partial<Pick<DefenseSession, 'createdAt' | 'updatedAt' | 'status' | 'messages'>>) {
  const previous = recentDefenseSessions()
  const saved = previous.find((value) => value.id === session.id)
  const value = JSON.stringify(
    recentSchema.parse(
      [
        {
          ...saved,
          id: session.id,
          projectId: session.project.id,
          name: session.project.name,
          mode: session.mode,
          ...(session.createdAt ? { createdAt: session.createdAt } : {}),
          ...(session.updatedAt ? { updatedAt: session.updatedAt } : {}),
          ...(session.status ? { status: session.status } : {}),
          ...(session.messages ? { answerCount: session.messages.filter((message) => message.sender === 'user').length } : {}),
        },
        ...previous.filter((v) => v.id !== session.id),
      ].slice(0, 20),
    ),
  )
  localStorage.setItem(DEFENSE_RECENT_KEY, value)
  if (localStorage.getItem(DEFENSE_RECENT_KEY) !== value)
    throw new Error('未能确认会话入口已保存。')
}
export function readDefenseDraft(id: string) {
  return draftSchema.parse(
    JSON.parse(localStorage.getItem(draftKey(id)) ?? '{"answer":"","operation":null}'),
  )
}
export function saveDefenseDraft(
  id: string,
  answer: string,
  operation: DefenseOperation | null,
  attachments?: Attachment[],
) {
  const value = JSON.stringify(
    draftSchema.parse({ answer, operation, ...(attachments?.length ? { attachments } : {}) }),
  )
  localStorage.setItem(draftKey(id), value)
  if (localStorage.getItem(draftKey(id)) !== value) throw new Error('无法确认草稿保存。')
}
