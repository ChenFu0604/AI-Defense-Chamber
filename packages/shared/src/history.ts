import { z } from 'zod'
import { projectSchema } from './project.js'
import { analysisRecordSchema } from './analysis.js'
import { defenseSessionSchema } from './defense.js'
import {
  defenseReportSchema,
  reportEvidenceIsValid,
  reportDimensionIds,
  type DefenseReport,
} from './report.js'

export const historyEntrySchema = z
  .strictObject({
    session: defenseSessionSchema,
    report: defenseReportSchema.nullable(),
    archivedAt: z.iso.datetime(),
  })
  .superRefine((entry, ctx) => {
    if (
      entry.report &&
      (entry.session.status !== 'ended' ||
        entry.session.mode !== 'live' ||
        entry.report.sessionId !== entry.session.id ||
        entry.report.projectId !== entry.session.project.id ||
        !reportEvidenceIsValid(entry.report.output, entry.session))
    )
      ctx.addIssue({ code: 'custom', message: '历史报告与会话快照不匹配。' })
  })
export type HistoryEntry = z.infer<typeof historyEntrySchema>
export const historyArchiveSchema = z
  .strictObject({
    version: z.literal(1),
    projects: z.array(projectSchema).max(300),
    analyses: z.array(analysisRecordSchema).max(600),
    entries: z.array(historyEntrySchema).max(300),
  })
  .refine(
    (value) =>
      new Set(value.projects.map((p) => p.id)).size === value.projects.length &&
      new Set(value.analyses.map((a) => a.id)).size === value.analyses.length &&
      new Set(value.entries.map((e) => e.session.id)).size === value.entries.length,
    { message: '历史记录 ID 重复。' },
  )
export type HistoryArchive = z.infer<typeof historyArchiveSchema>
export function compareHistoryReports(before: DefenseReport, after: DefenseReport) {
  const a = defenseReportSchema.parse(before),
    b = defenseReportSchema.parse(after)
  if (a.sessionId === b.sessionId || a.projectId !== b.projectId)
    throw new Error('请选择同一项目的两场不同答辩报告。')
  return {
    overall: Math.round((b.overallScore - a.overallScore) * 10) / 10,
    dimensions: reportDimensionIds.map((id) => ({
      id,
      before: a.output.dimensions[id].score,
      after: b.output.dimensions[id].score,
      delta: b.output.dimensions[id].score - a.output.dimensions[id].score,
    })),
  }
}
