import { z } from 'zod'
import { projectInputSchema, projectSchema } from './project.js'

const text = (max = 1600) => z.string().trim().min(1).max(max)
export const evidenceReferenceSchema = z.strictObject({
  field: z.enum([
    'name',
    'description',
    'targetUsers',
    'coreFeatures',
    'technicalPlan',
    'valueProposition',
    'materials',
  ]),
  quote: text(600),
})
export const findingSchema = z.strictObject({
  summary: text(1200),
  reasoning: text(1800),
  certainty: z.enum(['provided', 'inferred', 'insufficient']),
  evidence: z.array(evidenceReferenceSchema).max(5),
})
export const analysisOutputSchema = z.strictObject({
  coreValue: findingSchema,
  targetUsersAndScenarios: z.array(findingSchema).min(1).max(6),
  strengths: z.array(findingSchema).max(8),
  technicalFeasibility: findingSchema,
  businessValue: findingSchema,
  risks: z
    .array(
      findingSchema.extend({
        title: text(120),
        severity: z.enum(['low', 'medium', 'high']),
        suggestion: text(1200),
      }),
    )
    .max(12),
  evidenceGaps: z
    .array(
      z.strictObject({
        topic: text(160),
        missingEvidence: text(1000),
        suggestedAction: text(1200),
      }),
    )
    .max(12),
  questionDirections: z
    .array(
      z.strictObject({
        judge: z.enum(['business', 'technical', 'user', 'devil']),
        topic: text(160),
        question: text(600),
        reason: text(1000),
      }),
    )
    .min(1)
    .max(8),
})

export const analyzeProjectRequestSchema = z.strictObject({
  project: projectSchema,
  mode: z.enum(['live', 'demo']).default('live'),
})

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>
export type AnalysisFinding = z.infer<typeof findingSchema>
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>
export type AnalyzeProjectRequest = z.infer<typeof analyzeProjectRequestSchema>
export type AnalysisMode = AnalyzeProjectRequest['mode']

export function analysisEvidenceIsValid(
  output: AnalysisOutput,
  project: z.infer<typeof projectInputSchema>,
): boolean {
  const findings: AnalysisFinding[] = [
    output.coreValue,
    ...output.targetUsersAndScenarios,
    ...output.strengths,
    output.technicalFeasibility,
    output.businessValue,
    ...output.risks,
  ]
  return findings.every((finding) => {
    if (finding.certainty === 'provided' && finding.evidence.length === 0) return false
    return finding.evidence.every((reference) =>
      reference.field === 'materials'
        ? !!project.attachments?.some((file) => !!file.text && file.text.includes(reference.quote))
        : project[reference.field].includes(reference.quote),
    )
  })
}

export const analysisRecordSchema = z
  .strictObject({
    id: z.uuid(),
    projectId: z.uuid(),
    projectSnapshot: projectInputSchema,
    createdAt: z.iso.datetime(),
    mode: z.enum(['live', 'demo']),
    model: z.string().trim().min(1).max(200).nullable(),
    output: analysisOutputSchema,
  })
  .superRefine((record, context) => {
    if (
      (record.mode === 'live' && record.model === null) ||
      (record.mode === 'demo' && record.model !== null)
    )
      context.addIssue({ code: 'custom', message: '分析来源与模型元信息不一致。' })
    if (!analysisEvidenceIsValid(record.output, record.projectSnapshot))
      context.addIssue({ code: 'custom', message: '分析引用不属于项目资料，或材料结论缺少引用。' })
  })

export const analysisResponseSchema = z.strictObject({
  success: z.literal(true),
  data: analysisRecordSchema,
})
export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }),
})
export const analysisCollectionSchema = z
  .strictObject({ version: z.literal(1), records: z.array(analysisRecordSchema) })
  .refine(
    ({ records }) =>
      new Set(records.map((record) => record.projectId + ':' + record.mode)).size ===
      records.length,
    { message: '分析记录重复。' },
  )

export type AnalysisRecord = z.infer<typeof analysisRecordSchema>

export function analysisMatchesProject(
  record: AnalysisRecord,
  project: z.infer<typeof projectSchema>,
) {
  return (
    record.projectId === project.id &&
    JSON.stringify(record.projectSnapshot) === JSON.stringify(projectInputSchema.parse(project))
  )
}

export const certaintyLabels = {
  provided: '材料中提及',
  inferred: '待验证推测',
  insufficient: '证据不足',
} as const
export const severityLabels = { low: '低风险', medium: '中风险', high: '高风险' } as const
export const judgeLabels = {
  business: '商业评委',
  technical: '技术评委',
  user: '用户评委',
  devil: '魔鬼评委',
} as const
