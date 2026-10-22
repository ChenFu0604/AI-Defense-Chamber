import { z } from 'zod'

export const trainingPreferencesSchema = z.strictObject({
  style: z.enum(['guided', 'rehearsal']),
  goal: z.enum(['general', 'value', 'technical', 'users']),
  questionLimit: z.union([z.literal(5), z.literal(10)]),
})
export type TrainingPreferences = z.infer<typeof trainingPreferencesSchema>
export const trainingStyleLabels = { guided: '项目梳理', rehearsal: '答辩演练' } as const
export const trainingGoalLabels = {
  general: '整体梳理', value: '讲清项目价值', technical: '梳理实现方案', users: '检查用户需求',
} as const
export const assistanceKindLabels = {
  hint: '没思路，给我一点提示',
  rephrase: '换个容易理解的说法',
  no_evidence: '暂时没有这项数据',
} as const
export const assistanceRequestSchema = z.strictObject({
  requestId: z.uuid(), questionId: z.uuid(), kind: z.enum(['hint', 'rephrase', 'no_evidence']),
})
export type AssistanceRequest = z.infer<typeof assistanceRequestSchema>
export type AssistanceKind = AssistanceRequest['kind']
export const assistanceOutputSchema = z.strictObject({ content: z.string().trim().min(1).max(1200) })
export const assistanceRecordSchema = assistanceRequestSchema.extend({
  judgeId: z.enum(['business', 'technical', 'user', 'devil']),
  content: z.string().trim().min(1).max(1200), createdAt: z.iso.datetime(),
  mode: z.enum(['live', 'demo']), model: z.string().trim().min(1).max(200).nullable(),
})
export type AssistanceRecord = z.infer<typeof assistanceRecordSchema>
// Missing preferences identify a legacy session; never silently shorten old training.
export function trainingSettings(session: { preferences?: TrainingPreferences }) {
  return session.preferences ?? { style: 'rehearsal' as const, goal: 'general' as const, questionLimit: 30 }
}
