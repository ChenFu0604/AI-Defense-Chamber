import { describe, expect, it } from 'vitest'
import { buildRiskGraph, riskGraphSchema, riskNodeSchema } from '@defense/shared'
import { analysisFixture, analysisProject } from '../../../../tests/fixtures/analysis'
import { endedReportSession, reportFixture } from '../../../../tests/fixtures/report'
import { buildFlowElements } from '../components/risk/risk-layout'

function input() {
  const session = endedReportSession()
  return { project: session.project, analysis: session.analysis, session, report: reportFixture() }
}
describe('risk map projection and contracts', () => {
  it('includes final-answer risks and their actual answer reference', () => {
    const source = input(), answer = source.session.messages.find(v => v.sender === 'user')!
    source.session.closingFeedback = {answerMessageId: answer.id, model: 'test-model', assessment: {
      answerQuote: answer.content.slice(0, 20), evaluation: 'evidence_missing', feedback: '尚需核对试点记录。', nextStrategy: 'change_direction',
      risks: [{title: '最后回答中的待核对假设', severity: 'high'}],
    }}
    const graph = buildRiskGraph({...source, report: null})
    const node = graph.nodes.find(v => v.name === '最后回答中的待核对假设')!
    expect(node.source).toBe('ai_inference')
    expect(node.evidence[0]).toMatchObject({locator: answer.id, quote: answer.content.slice(0, 20)})
    expect(node.verification).toBeNull()
    source.session.closingFeedback.assessment.answerQuote = '不存在的引文'
    expect(() => buildRiskGraph({...source, report: null})).toThrow()
  })
  it('projects real saved risks and report gaps with unique stable IDs and unmodified descriptions', () => {
    const source = input(),
      first = buildRiskGraph(source),
      second = buildRiskGraph(source)
    expect(second).toEqual(first)
    expect(new Set(first.nodes.map((node) => node.id)).size).toBe(first.nodes.length)
    const analysisRisk = first.nodes.find((node) => node.category === 'analysis')!
    expect(analysisRisk.name).toBe(source.analysis.output.risks[0]!.title)
    expect(analysisRisk.description).toContain(source.analysis.output.risks[0]!.summary)
    expect(analysisRisk.suggestions).toEqual([source.analysis.output.risks[0]!.suggestion])
    const reportRisk = first.nodes.find((node) => node.category === 'report')!
    expect(reportRisk.description).toBe(source.report.output.weaknesses[0]!.detail)
    expect(reportRisk.evidenceGaps).toContain(source.report.output.evidenceGaps[0]!.neededEvidence)
    expect(reportRisk.suggestions[0]).toContain(source.report.output.improvements[0]!.action)
    expect(first.nodes.filter((node) => node.category === 'report')).toHaveLength(1)
    expect(reportRisk.level).toBe('high')
  })
  it('uses common original references to connect nodes and never invents causal links', () => {
    const graph = buildRiskGraph(input())
    expect(graph.edges.length).toBeGreaterThan(0)
    for (const edge of graph.edges) {
      expect(graph.nodes.some((node) => node.id === edge.source)).toBe(true)
      expect(graph.nodes.some((node) => node.id === edge.target)).toBe(true)
      expect(edge.relationship).toBe('shared_evidence')
      expect(edge.explanation).toContain('不代表因果关系')
      expect(
        edge.evidence.every(
          (ref) => ref.origin === 'defense_answer' || ref.origin === 'project_material',
        ),
      ).toBe(true)
    }
  })
  it('does not infer relationships from similar titles or from an AI document alone', () => {
    const analysis = analysisFixture()
    analysis.output.evidenceGaps[0]!.topic = analysis.output.risks[0]!.title
    const graph = buildRiskGraph({
      project: analysisProject,
      analysis,
      session: null,
      report: null,
    })
    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges).toEqual([])
    expect(graph.nodes[0]!.evidenceGaps).toEqual([])
  })
  it('keeps user claims and AI inference distinct and requires manual review for supported conclusions', () => {
    const source = input()
    source.analysis.output.risks[0]!.certainty = 'provided'
    source.session.analysis = source.analysis
    const graph = buildRiskGraph(source)
    expect(graph.nodes.find((node) => node.category === 'analysis')!.source).toBe(
      'project_material',
    )
    expect(graph.nodes.find((node) => node.category === 'report')!.source).toBe('ai_inference')
    expect(
      graph.nodes.every(
        (node) => node.source !== 'evidence_supported' && node.verification === null,
      ),
    ).toBe(true)
    const node = graph.nodes[0]!
    expect(riskNodeSchema.safeParse({ ...node, source: 'evidence_supported' }).success).toBe(false)
    expect(
      riskNodeSchema.safeParse({
        ...node,
        source: 'evidence_supported',
        verification: {
          method: 'manual_review',
          reviewedBy: '测试核验人',
          reviewedAt: '2026-10-20T10:00:00.000Z',
          note: '仅验证人工记录契约。',
        },
      }).success,
    ).toBe(true)
  })
  it('handles empty sources without adding decorative risks', () => {
    const graph = buildRiskGraph({
      project: analysisProject,
      analysis: null,
      session: null,
      report: null,
    })
    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
    const analysis = analysisFixture()
    analysis.output.risks = []
    analysis.output.evidenceGaps = []
    expect(
      buildRiskGraph({ project: analysisProject, analysis, session: null, report: null }).nodes,
    ).toEqual([])
  })
  it('rejects missing fields, duplicate IDs, dangling edges, self-links and unsupported connections', () => {
    const graph = buildRiskGraph(input()),
      edge = graph.edges[0]!
    expect(riskGraphSchema.safeParse({ ...graph, nodes: [{ id: 'broken' }] }).success).toBe(false)
    expect(
      riskGraphSchema.safeParse({ ...graph, nodes: [...graph.nodes, graph.nodes[0]] }).success,
    ).toBe(false)
    expect(
      riskGraphSchema.safeParse({ ...graph, edges: [{ ...edge, target: 'missing' }] }).success,
    ).toBe(false)
    expect(
      riskGraphSchema.safeParse({ ...graph, edges: [{ ...edge, target: edge.source }] }).success,
    ).toBe(false)
    expect(
      riskGraphSchema.safeParse({
        ...graph,
        edges: [...graph.edges, { ...edge, id: 'duplicate-pair' }],
      }).success,
    ).toBe(false)
    expect(
      riskGraphSchema.safeParse({ ...graph, edges: [{ ...edge, source: graph.nodes[0]!.id }] })
        .success,
    ).toBe(false)
  })
  it('rejects project/report mismatch and fabricated answer references', () => {
    const source = input()
    expect(() =>
      buildRiskGraph({ ...source, project: { ...source.project, name: '已改变' } }),
    ).toThrow('不匹配')
    expect(() =>
      buildRiskGraph({ ...source, report: { ...source.report, sessionId: source.report.id } }),
    ).toThrow('不匹配')
    source.report.output.weaknesses[0]!.references[0]!.quote = '不存在的引文'
    expect(() => buildRiskGraph(source)).toThrow('不匹配')
  })
  it('marks demo sources and does not mix demo sessions with live reports', () => {
    const graph = buildRiskGraph({
      project: analysisProject,
      analysis: analysisFixture('demo'),
      session: null,
      report: null,
    })
    expect(graph.mode).toBe('demo')
    const source = input()
    source.session.mode = 'demo'
    expect(() => buildRiskGraph(source)).toThrow()
  })
  it('converts every valid node and edge to Vue Flow without losing its details', () => {
    const graph = buildRiskGraph(input()),
      selectedId = graph.nodes[0]!.id
    const flow = buildFlowElements(graph, selectedId)
    expect(flow.nodes).toHaveLength(graph.nodes.length)
    expect(flow.edges).toHaveLength(graph.edges.length)
    expect(new Set(flow.nodes.map((node) => JSON.stringify(node.position))).size).toBe(
      flow.nodes.length,
    )
    expect(flow.nodes.find((node) => node.selected)?.id).toBe(selectedId)
    for (const node of flow.nodes) {
      expect(node.data).toEqual(graph.nodes.find((item) => item.id === node.id))
      expect(node.connectable).toBe(false)
    }
  })
})
