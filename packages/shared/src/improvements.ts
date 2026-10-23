import { z } from 'zod'
import { attachmentListSchema } from './attachments.js'
import { defenseReportSchema, reportDimensionIds, reportReferenceSchema, type DefenseReport } from './report.js'

export const improvementStatusLabels = { todo: '待处理', in_progress: '进行中', done: '已完成（自行记录）' } as const
export const improvementUpdateSchema = z.strictObject({
  status: z.enum(['todo', 'in_progress', 'done']),
  note: z.string().trim().max(2000),
  attachments: attachmentListSchema.optional(),
})
export type ImprovementUpdate = z.infer<typeof improvementUpdateSchema>
export const retrainingTaskUpdateSchema = improvementUpdateSchema.extend({
  improvementIndex: z.number().int().min(0).max(7),
})
export const retrainingTaskUpdatesSchema = z.array(retrainingTaskUpdateSchema).max(5)
  .refine(items => new Set(items.map(t => t.improvementIndex)).size === items.length, '不能重复选择同一改进任务。')
export const retrainingTaskSchema = retrainingTaskUpdateSchema.extend({
  title: z.string().trim().min(1).max(100),
  action: z.string().trim().min(1).max(600),
  acceptanceCriteria: z.string().trim().min(1).max(500),
})
export const improvementTaskSchema = improvementUpdateSchema.extend({
  id: z.uuid(), projectId: z.uuid(), projectName: z.string().trim().min(1).max(80),
  sourceReportId: z.uuid(), sourceSessionId: z.uuid(), improvementIndex: z.number().int().min(0).max(7),
  title: z.string().trim().min(1).max(100), action: z.string().trim().min(1).max(600),
  acceptanceCriteria: z.string().trim().min(1).max(500),
  dimension: z.enum(reportDimensionIds), priority: z.enum(['high', 'medium', 'low']),
  references: z.array(reportReferenceSchema).min(1).max(3),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).refine(t => Date.parse(t.updatedAt) >= Date.parse(t.createdAt), '任务更新时间无效。')
export type ImprovementTask = z.infer<typeof improvementTaskSchema>
export const improvementCollectionSchema = z.strictObject({ version: z.literal(1), tasks: z.array(improvementTaskSchema).max(300) })
  .refine(({tasks}) => new Set(tasks.map(t => t.id)).size === tasks.length &&
    new Set(tasks.map(t => `${t.sourceReportId}:${t.improvementIndex}`)).size === tasks.length, '改进任务标识或来源重复。')
export function createImprovementTask(report: DefenseReport, index: number, projectName: string, id: string, now: string): ImprovementTask {
  const source = defenseReportSchema.parse(report), item = source.output.improvements[index]
  if (!item || !Number.isInteger(index)) throw new Error('报告中没有这项改进建议。')
  return improvementTaskSchema.parse({...item, id, projectId: source.projectId, projectName,
    sourceReportId: source.id, sourceSessionId: source.sessionId, improvementIndex: index,
    status: 'todo', note: '', createdAt: now, updatedAt: now})
}
