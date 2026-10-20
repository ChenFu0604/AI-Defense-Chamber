import { z } from 'zod'
import { projectSchema, type Project } from './project.js'
import { analysisMatchesProject, analysisRecordSchema, type AnalysisRecord } from './analysis.js'
import { defenseSessionSchema, type DefenseSession } from './defense.js'
import {
  defenseReportSchema,
  reportEvidenceIsValid,
  type DefenseReport,
  type ReportReference,
} from './report.js'
import {
  riskGraphSchema,
  type RiskGraph,
  type RiskNode,
  type RiskEdge,
  type RiskEvidence,
} from './risk-map.js'

export interface RiskMapInput {
  project: Project
  analysis: AnalysisRecord | null
  session: DefenseSession | null
  report: DefenseReport | null
}
const inputSchema = z.strictObject({
  project: projectSchema,
  analysis: analysisRecordSchema.nullable(),
  session: defenseSessionSchema.nullable(),
  report: defenseReportSchema.nullable(),
})
export function buildRiskGraph(input: RiskMapInput): RiskGraph {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) throw new Error('漏洞地图来源数据缺失或格式无效，请检查项目、画像和报告。')
  const { project, analysis, session, report } = parsed.data
  if (
    (analysis && !analysisMatchesProject(analysis, project)) ||
    (session &&
      (JSON.stringify(session.project) !== JSON.stringify(project) ||
        JSON.stringify(analysis) !== JSON.stringify(session.analysis))) ||
    (report &&
      (!session ||
        session.status !== 'ended' ||
        session.mode !== 'live' ||
        report.sessionId !== session.id ||
        report.projectId !== project.id ||
        !reportEvidenceIsValid(report.output, session)))
  )
    throw new Error('项目、画像、会话或报告不匹配，未绘制漏洞地图。')
  const nodes: RiskNode[] = []
  const doc = (
    origin: RiskEvidence['origin'],
    recordId: string,
    locator: string,
    quote: string,
  ): RiskEvidence => ({ origin, recordId, locator, quote })
  if (analysis) {
    analysis.output.risks.forEach((risk, index) =>
      nodes.push({
        id: `analysis-${analysis.id}-risk-${index}`,
        name: risk.title,
        description: risk.summary + '\n' + risk.reasoning,
        level: risk.severity,
        levelReason: '沿用项目画像的风险建议等级，不是客观测量。',
        source: risk.certainty === 'provided' ? 'project_material' : 'ai_inference',
        category: 'analysis',
        evidence: [
          ...risk.evidence.map((ref) =>
            doc(
              'project_material',
              project.id,
              ref.field === 'materials'
                ? 'attachment.' +
                    (project.attachments?.find((a) => a.text.includes(ref.quote))?.id ?? 'unknown')
                : ref.field,
              ref.quote,
            ),
          ),
          doc('ai_analysis', analysis.id, `risks.${index}`, risk.summary),
        ],
        evidenceGaps: risk.certainty === 'insufficient' ? [risk.reasoning] : [],
        suggestions: [risk.suggestion],
        verification: null,
      }),
    )
    analysis.output.evidenceGaps.forEach((gap, index) =>
      nodes.push({
        id: `analysis-${analysis.id}-gap-${index}`,
        name: `证据缺口：${gap.topic}`,
        description: gap.missingEvidence,
        level: 'medium',
        levelReason: '原画像未给此缺口定级；中级仅为默认展示等级。',
        source: 'ai_inference',
        category: 'evidence_gap',
        evidence: [doc('ai_analysis', analysis.id, `evidenceGaps.${index}`, gap.missingEvidence)],
        evidenceGaps: [gap.missingEvidence],
        suggestions: [gap.suggestedAction],
        verification: null,
      }),
    )
  }
  const answerEvidence = (refs: ReportReference[]) =>
    refs.map((ref) => doc('defense_answer', session!.id, ref.messageId, ref.quote))
  if (session) {
    session.messages.forEach((message) => {
      if (!message.assessment) return
      const answer = session.messages.find(
        (item) => item.id === message.replyTo && item.sender === 'user',
      )
      if (!answer || !answer.content.includes(message.assessment.answerQuote))
        throw new Error('逐轮风险缺少有效的回答原文，未绘制漏洞地图。')
      message.assessment.risks.forEach((risk, index) =>
        nodes.push({
          id: `turn-${message.id}-${index}`,
          name: risk.title,
          description: message.assessment!.feedback,
          level: risk.severity,
          levelReason: '沿用评委逐轮反馈的建议等级，尚待核实。',
          source: 'ai_inference',
          category: 'answer',
          evidence: [
            doc('defense_answer', session.id, answer.id, message.assessment!.answerQuote),
            doc('ai_turn', message.id, `assessment.risks.${index}`, risk.title),
          ],
          evidenceGaps:
            message.assessment!.evaluation === 'evidence_missing'
              ? [message.assessment!.feedback]
              : [],
          suggestions: [],
          verification: null,
        }),
      )
    })
  }
  if (report) {
    const level = { high: 'high', medium: 'medium', low: 'low' } as const
    for (const section of ['weaknesses', 'priorities', 'evidenceGaps'] as const) {
      report.output[section].forEach((item, index) => {
        const priority = section === 'priorities' ? report.output.priorities[index]!.priority : null
        const neededEvidence =
          section === 'evidenceGaps' ? report.output.evidenceGaps[index]!.neededEvidence : null
        const suggestions = report.output.improvements
          .filter((task) =>
            task.references.some((ref) =>
              item.references.some((own) => own.messageId === ref.messageId),
            ),
          )
          .map((task) => `${task.action} 完成标准：${task.acceptanceCriteria}`)
        const duplicate =
          section !== 'evidenceGaps'
            ? nodes.find(
                (node) =>
                  node.category === 'report' &&
                  node.name === item.title &&
                  node.description === item.detail &&
                  JSON.stringify(node.evidence.filter((ref) => ref.origin === 'defense_answer')) ===
                    JSON.stringify(answerEvidence(item.references)),
              )
            : null
        if (duplicate) {
          if (priority) {
            duplicate.level = level[priority]
            duplicate.levelReason = '按报告建议处理优先级映射展示，非独立风险测量。'
          }
          duplicate.evidence.push(doc('ai_report', report.id, `${section}.${index}`, item.detail))
          return
        }
        nodes.push({
          id: `report-${report.id}-${section}-${index}`,
          name: item.title,
          description: item.detail,
          level: priority ? level[priority] : 'medium',
          levelReason: priority
            ? '按报告建议处理优先级映射展示，非独立风险测量。'
            : '报告未给此项风险定级；中级仅为默认展示等级。',
          source: 'ai_inference',
          category: section === 'evidenceGaps' ? 'evidence_gap' : 'report',
          evidence: [
            ...answerEvidence(item.references),
            doc('ai_report', report.id, `${section}.${index}`, item.detail),
          ],
          evidenceGaps: neededEvidence ? [neededEvidence] : [],
          suggestions: suggestions.slice(0, 8),
          verification: null,
        })
      })
    }
  }
  // Shared source records explain correlation; they do not establish causality.
  const groups = new Map<string, { node: RiskNode; ref: RiskEvidence }[]>()
  for (const node of nodes)
    for (const ref of node.evidence) {
      if (!['project_material', 'defense_answer'].includes(ref.origin)) continue
      const key = `${ref.origin}:${ref.recordId}:${ref.locator}`
      const items = groups.get(key) ?? []
      if (!items.some((item) => item.node.id === node.id)) items.push({ node, ref })
      groups.set(key, items)
    }
  const edges: RiskEdge[] = [],
    connected = new Set<string>()
  for (const items of groups.values()) {
    const first = items[0]!
    for (const next of items.slice(1)) {
      const key = [first.node.id, next.node.id].sort().join(':')
      if (connected.has(key)) continue
      connected.add(key)
      edges.push({
        id: `relation-${edges.length}`,
        source: first.node.id,
        target: next.node.id,
        relationship: 'shared_evidence',
        explanation:
          first.ref.origin === 'defense_answer'
            ? '两项均引用同一条答辩回答，仅表示共同依据，不代表因果关系。'
            : `两项均引用项目字段 ${first.ref.locator}，仅表示共同材料来源，不代表因果关系。`,
        evidence: [first.ref, next.ref],
      })
    }
  }
  // Only attach gaps that have an explicit common source, never by fuzzy keywords.
  for (const node of nodes) {
    const gaps = nodes.filter(
      (other) =>
        other.id !== node.id &&
        other.category === 'evidence_gap' &&
        other.evidence.some(
          (ref) =>
            ['project_material', 'defense_answer'].includes(ref.origin) &&
            node.evidence.some(
              (own) =>
                own.origin === ref.origin &&
                own.recordId === ref.recordId &&
                own.locator === ref.locator,
            ),
        ),
    )
    node.evidenceGaps = [
      ...new Set([...node.evidenceGaps, ...gaps.flatMap((gap) => gap.evidenceGaps)]),
    ]
  }
  return riskGraphSchema.parse({
    projectId: project.id,
    mode: analysis?.mode ?? session?.mode ?? 'live',
    analysisId: analysis?.id ?? null,
    sessionId: session?.id ?? null,
    reportId: report?.id ?? null,
    nodes,
    edges,
  })
}
