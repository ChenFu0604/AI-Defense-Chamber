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
export type ReportDimensionId = (typeof reportDimensionIds)[number]
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
// Version 1 remains readable without inferring coverage from free-form reasons.
const legacyDimensionEvaluationSchema = z.strictObject({
  score: z.number().int().min(0).max(100),
  reason: text(700),
  references,
})
// Plain union emits nested anyOf for model structured-output compatibility.
export const dimensionEvaluationSchema = z.union([
  z.strictObject({
    status: z.enum(['assessed']),
    score: z.number().int().min(0).max(100),
    reason: text(700),
    references,
  }),
  z.strictObject({
    status: z.enum(['insufficient']),
    score: z.null(),
    reason: text(700),
    // An unobserved topic may have no answer to cite. Any supplied quote is still checked.
    references: z.array(reportReferenceSchema).max(3),
  }),
])
const legacyReportDimensionsSchema = z.strictObject({
  logic: legacyDimensionEvaluationSchema,
  evidence: legacyDimensionEvaluationSchema,
  technical: legacyDimensionEvaluationSchema,
  value: legacyDimensionEvaluationSchema,
  adaptability: legacyDimensionEvaluationSchema,
})
export const reportDimensionsSchema = z.strictObject({
  logic: dimensionEvaluationSchema,
  evidence: dimensionEvaluationSchema,
  technical: dimensionEvaluationSchema,
  value: dimensionEvaluationSchema,
  adaptability: dimensionEvaluationSchema,
})
const finding = z.strictObject({ title: text(100), detail: text(600), references })
const reportOutputFields = {
  summary: text(1000),
  limitations: text(1000),
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
}
export const reportOutputSchema = z.strictObject({
  ...reportOutputFields,
  dimensions: reportDimensionsSchema,
})
export const legacyReportOutputSchema = z.strictObject({
  ...reportOutputFields,
  dimensions: legacyReportDimensionsSchema,
})
export type ReportOutput = z.infer<typeof reportOutputSchema>
export type ReportDimensions = z.infer<typeof reportDimensionsSchema>
export type LegacyReportOutput = z.infer<typeof legacyReportOutputSchema>
export type LegacyReportDimensions = z.infer<typeof legacyReportDimensionsSchema>
export type AnyReportDimensions = ReportDimensions | LegacyReportDimensions
export type ReportDimension =
  | ReportDimensions[ReportDimensionId]
  | LegacyReportDimensions[ReportDimensionId]
export type DimensionAssessment = 'assessed' | 'insufficient' | 'legacy'
export type ReportReference = z.infer<typeof reportReferenceSchema>

export function getDimensionAssessment(dimension: ReportDimension): DimensionAssessment {
  return 'status' in dimension ? dimension.status : 'legacy'
}
// Keep the original five equal weights. Partial observations never become a full score.
export function calculateOverallScore(dimensions: AnyReportDimensions): number | null {
  const valid = z.union([reportDimensionsSchema, legacyReportDimensionsSchema]).parse(dimensions)
  let total = 0
  for (const id of reportDimensionIds) {
    const score = valid[id].score
    if (score === null) return null
    total += score
  }
  return Math.round((total / 5) * 10) / 10
}
export function reportReferences(output: ReportOutput | LegacyReportOutput): ReportReference[] {
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
export function reportEvidenceIsValid(
  output: ReportOutput | LegacyReportOutput,
  session: DefenseSession,
): boolean {
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
const reportFields = {
  id: z.uuid(),
  sessionId: z.uuid(),
  projectId: z.uuid(),
  createdAt: z.iso.datetime(),
  mode: z.literal('live'),
  model: text(200),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  answerCount: z.number().int().min(1).max(100),
  retrieval: ragRetrievalSchema.optional(),
}
export const defenseReportSchema = z
  .discriminatedUnion('version', [
    z.strictObject({
      ...reportFields,
      version: z.literal(1),
      overallScore: z.number().min(0).max(100),
      output: legacyReportOutputSchema,
    }),
    z.strictObject({
      ...reportFields,
      version: z.literal(2),
      overallScore: z.number().min(0).max(100).nullable(),
      output: reportOutputSchema,
    }),
  ])
  .refine((report) => report.overallScore === calculateOverallScore(report.output.dimensions), {
    message: '综合评分必须为完整五维的等权平均；观察不足时必须为空。',
  })
  .refine((report) => !report.retrieval || report.retrieval.projectId === report.projectId, {
    message: '检索资料与报告项目不一致。',
  })
export type DefenseReport = z.infer<typeof defenseReportSchema>
export type CurrentDefenseReport = Extract<DefenseReport, { version: 2 }>
export type LegacyDefenseReport = Extract<DefenseReport, { version: 1 }>
export function getReportCoverage(report: DefenseReport) {
  return {
    assessed: reportDimensionIds.filter(
      (id) => getDimensionAssessment(report.output.dimensions[id]) === 'assessed',
    ).length,
    total: 5 as const,
    insufficient: reportDimensionIds.filter(
      (id) => getDimensionAssessment(report.output.dimensions[id]) === 'insufficient',
    ),
    legacy: report.version === 1,
  }
}
export const reportResponseSchema = z.strictObject({
  success: z.literal(true),
  data: defenseReportSchema,
})
