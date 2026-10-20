import { z } from 'zod'

const text = (max: number) => z.string().trim().min(1).max(max)
export const riskSourceLabels = {
  project_material: '用户项目资料',
  defense_answer: '用户答辩回答',
  ai_inference: 'AI 推测 / 待核实',
  evidence_supported: '有证据支持（人工核验）',
} as const
export const riskEvidenceSchema = z.strictObject({
  origin: z.enum(['project_material', 'defense_answer', 'ai_analysis', 'ai_report', 'ai_turn']),
  recordId: z.uuid(),
  locator: text(200),
  quote: text(4000),
})
export const riskNodeSchema = z
  .strictObject({
    id: text(180).regex(/^[a-zA-Z0-9_-]+$/),
    name: text(220),
    description: text(3400),
    level: z.enum(['high', 'medium', 'low']),
    levelReason: text(400),
    source: z.enum(['project_material', 'defense_answer', 'ai_inference', 'evidence_supported']),
    category: z.enum(['analysis', 'answer', 'report', 'evidence_gap']),
    evidence: z.array(riskEvidenceSchema).min(1).max(24),
    evidenceGaps: z.array(text(1200)).max(30),
    suggestions: z.array(text(1200)).max(8),
    verification: z
      .strictObject({
        method: z.literal('manual_review'),
        reviewedBy: text(100),
        reviewedAt: z.iso.datetime(),
        note: text(1200),
      })
      .nullable(),
  })
  .superRefine((node, ctx) => {
    if (
      node.source === 'evidence_supported' &&
      (!node.verification ||
        !node.evidence.some((ref) => ['project_material', 'defense_answer'].includes(ref.origin)))
    )
      ctx.addIssue({ code: 'custom', message: '证据支持结论必须有原始依据和人工核验记录。' })
    if (node.source !== 'evidence_supported' && node.verification)
      ctx.addIssue({ code: 'custom', message: '核验记录与风险来源不一致。' })
  })
export const riskEdgeSchema = z.strictObject({
  id: text(180),
  source: text(180),
  target: text(180),
  relationship: z.literal('shared_evidence'),
  explanation: text(600),
  evidence: z.array(riskEvidenceSchema).min(1).max(8),
})
export const riskGraphSchema = z
  .strictObject({
    projectId: z.uuid(),
    mode: z.enum(['live', 'demo']),
    analysisId: z.uuid().nullable(),
    sessionId: z.uuid().nullable(),
    reportId: z.uuid().nullable(),
    nodes: z.array(riskNodeSchema).max(200),
    edges: z.array(riskEdgeSchema).max(800),
  })
  .superRefine((graph, ctx) => {
    const ids = new Set(graph.nodes.map((node) => node.id))
    const pairs = graph.edges.map((edge) => [edge.source, edge.target].sort().join(':'))
    if (
      ids.size !== graph.nodes.length ||
      new Set(graph.edges.map((edge) => edge.id)).size !== graph.edges.length ||
      new Set(pairs).size !== pairs.length
    )
      ctx.addIssue({ code: 'custom', message: '节点、连线 ID 或节点关联重复。' })
    if (
      graph.edges.some(
        (edge) => edge.source === edge.target || !ids.has(edge.source) || !ids.has(edge.target),
      )
    )
      ctx.addIssue({ code: 'custom', message: '关联边引用了不存在的节点或自身。' })
    for (const edge of graph.edges) {
      const source = graph.nodes.find((node) => node.id === edge.source)
      const target = graph.nodes.find((node) => node.id === edge.target)
      if (edge.evidence.some((ref) => !['project_material', 'defense_answer'].includes(ref.origin)))
        ctx.addIssue({ code: 'custom', message: '共享依据连线必须引用原始资料或用户回答。' })
      if (
        source &&
        target &&
        !source.evidence.some((a) =>
          target.evidence.some(
            (b) =>
              ['project_material', 'defense_answer'].includes(a.origin) &&
              a.origin === b.origin &&
              a.recordId === b.recordId &&
              a.locator === b.locator,
          ),
        )
      )
        ctx.addIssue({ code: 'custom', message: '共享依据关联缺少两个节点共同引用的原始资料。' })
      if (
        edge.evidence.some(
          (ref) =>
            ![...(source?.evidence ?? []), ...(target?.evidence ?? [])].some(
              (item) => JSON.stringify(item) === JSON.stringify(ref),
            ),
        )
      )
        ctx.addIssue({ code: 'custom', message: '关联边依据不属于对应节点。' })
    }
  })
export type RiskNode = z.infer<typeof riskNodeSchema>
export type RiskEdge = z.infer<typeof riskEdgeSchema>
export type RiskGraph = z.infer<typeof riskGraphSchema>
export type RiskEvidence = z.infer<typeof riskEvidenceSchema>
