import { z } from 'zod'
import type { DefenseSession } from './defense.js'
import { ragRetrievalSchema } from './knowledge.js'

export const reportDimensionIds = [
  'logic',
  'evidence',
  'technical',
  'value',
  'adaptability',
] as const
export const reportDimensionLabels = {
  logic: '逻辑表达',
  evidence: '数据与证据支撑',
  technical: '技术可行性',
  value: '商业或应用价值',
  adaptability: '临场应变',
} as const
const text = (max: number) => z.string().trim().min(1).max(max)
export const reportReferenceSchema = z.strictObject({ messageId: z.uuid(), quote: text(200) })
const references = z.array(reportReferenceSchema).min(1).max(3)
export const dimensionEvaluationSchema = z.strictObject({
  score: z.number().int().min(0).max(100),
  reason: text(700),
  references,
})
export const reportDimensionsSchema = z.strictObject({
  logic: dimensionEvaluationSchema,
  evidence: dimensionEvaluationSchema,
  technical: dimensionEvaluationSchema,
  value: dimensionEvaluationSchema,
  adaptability: dimensionEvaluationSchema,
})
const finding = z.strictObject({ title: text(100), detail: text(600), references })
export const reportOutputSchema = z.strictObject({
  summary: text(1000),
  limitations: text(1000),
  dimensions: reportDimensionsSchema,
  strengths: z.array(finding).max(5),
  weaknesses: z.array(finding).max(5),
  evidenceGaps: z.array(finding.extend({ neededEvidence: text(500) })).max(5),
  priorities: z.array(finding.extend({ priority: z.enum(['high', 'medium', 'low']) })).max(5),
  improvements: z
    .array(
      z.strictObject({
        title: text(100),
        action: text(600),
        acceptanceCriteria: text(500),
        dimension: z.enum(reportDimensionIds),
        priority: z.enum(['high', 'medium', 'low']),
        references,
      }),
    )
    .min(1)
    .max(8),
})
export type ReportOutput = z.infer<typeof reportOutputSchema>
export type ReportDimensions = z.infer<typeof reportDimensionsSchema>
export type ReportReference = z.infer<typeof reportReferenceSchema>

// Each dimension has weight 20%. Round only the final mean to one decimal place.
export function calculateOverallScore(dimensions: ReportDimensions): number {
  const valid = reportDimensionsSchema.parse(dimensions)
  return (
    Math.round((reportDimensionIds.reduce((sum, key) => sum + valid[key].score, 0) / 5) * 10) / 10
  )
}
export function reportReferences(output: ReportOutput): ReportReference[] {
  return [
    ...reportDimensionIds.flatMap((key) => output.dimensions[key].references),
    ...[
      ...output.strengths,
      ...output.weaknesses,
      ...output.evidenceGaps,
      ...output.priorities,
      ...output.improvements,
    ].flatMap((item) => item.references),
  ]
}
export function reportEvidenceIsValid(output: ReportOutput, session: DefenseSession): boolean {
  return reportReferences(output).every((ref) =>
    session.messages.some(
      (message) =>
        message.id === ref.messageId &&
        message.sender === 'user' &&
        ['sent', 'failed'].includes(message.status) &&
        message.content.includes(ref.quote),
    ),
  )
}
export const defenseReportSchema = z
  .strictObject({
    version: z.literal(1),
    id: z.uuid(),
    sessionId: z.uuid(),
    projectId: z.uuid(),
    createdAt: z.iso.datetime(),
    mode: z.literal('live'),
    model: text(200),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    answerCount: z.number().int().min(1).max(100),
    overallScore: z.number().min(0).max(100),
    output: reportOutputSchema,
    retrieval: ragRetrievalSchema.optional(),
  })
  .refine((report) => report.overallScore === calculateOverallScore(report.output.dimensions) && (!report.retrieval || report.retrieval.projectId === report.projectId), {
    message: '综合评分与五维等权平均不一致。',
  })
export type DefenseReport = z.infer<typeof defenseReportSchema>
export const reportResponseSchema = z.strictObject({
  success: z.literal(true),
  data: defenseReportSchema,
})
