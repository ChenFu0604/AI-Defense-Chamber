import { z } from 'zod'
import { projectCollectionSchema, projectInputSchema, projectSchema } from './project.js'
import { analysisRecordSchema } from './analysis.js'
import { historyArchiveSchema, historyEntrySchema } from './history.js'
import { improvementTaskSchema, improvementUpdateSchema } from './improvements.js'

export const projectCreateRequestSchema = z.strictObject({ requestId: z.uuid(), input: projectInputSchema })
export const projectUpdateRequestSchema = z.strictObject({ expectedUpdatedAt: z.iso.datetime(), input: projectInputSchema })
export const projectArchiveRequestSchema = z.strictObject({ archived: z.boolean() })
export const taskCreateRequestSchema = z.strictObject({ sourceSessionId: z.uuid(), improvementIndex: z.number().int().min(0).max(7) })
export const taskUpdateRequestSchema = z.strictObject({ expectedUpdatedAt: z.iso.datetime(), update: improvementUpdateSchema })
// Server reads are not constrained by the old LocalStorage archive's 300-item quota.
export const serverHistorySchema = historyArchiveSchema.safeExtend({
  projects: z.array(projectSchema), analyses: z.array(analysisRecordSchema), entries: z.array(historyEntrySchema),
})
export const projectWorkspaceResponseSchema = z.strictObject({ success: z.literal(true), data: projectCollectionSchema })
export const projectRecordResponseSchema = z.strictObject({ success: z.literal(true), data: projectSchema })
export const analysisListResponseSchema = z.strictObject({ success: z.literal(true), data: z.array(analysisRecordSchema) })
export const serverHistoryResponseSchema = z.strictObject({ success: z.literal(true), data: serverHistorySchema })
export const taskListResponseSchema = z.strictObject({ success: z.literal(true), data: z.array(improvementTaskSchema) })
export const workspaceImportRequestSchema = z.strictObject({
  requestId: z.uuid(), projects: projectCollectionSchema,
  analyses: z.array(analysisRecordSchema).max(1000), history: historyArchiveSchema.nullable(),
  tasks: z.array(improvementTaskSchema).max(300),
})
export const workspaceImportResultSchema = z.strictObject({
  requestId: z.uuid(), alreadyImported: z.boolean(),
  counts: z.strictObject({ projects: z.number().int().nonnegative(), analyses: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(), reports: z.number().int().nonnegative(), tasks: z.number().int().nonnegative() }),
})
export const workspaceImportResponseSchema = z.strictObject({ success: z.literal(true), data: workspaceImportResultSchema })
export type ProjectCreateRequest = z.infer<typeof projectCreateRequestSchema>
export type ProjectUpdateRequest = z.infer<typeof projectUpdateRequestSchema>
export type TaskCreateRequest = z.infer<typeof taskCreateRequestSchema>
export type TaskUpdateRequest = z.infer<typeof taskUpdateRequestSchema>
export type ServerHistory = z.infer<typeof serverHistorySchema>
export type WorkspaceImportRequest = z.infer<typeof workspaceImportRequestSchema>
export type WorkspaceImportResult = z.infer<typeof workspaceImportResultSchema>
