import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { buildRiskGraph } from '@defense/shared'
import RiskNodeDetails from '../components/risk/RiskNodeDetails.vue'
import { endedReportSession, reportFixture } from '../../../../tests/fixtures/report'
describe('risk details rendering', () => {
  it('shows the selected actual source, quotes, gaps and actions with related node explanations', async () => {
    const session = endedReportSession(),
      report = reportFixture()
    const graph = buildRiskGraph({
      project: session.project,
      analysis: session.analysis,
      session,
      report,
    })
    const node = graph.nodes.find((item) => item.category === 'report')!
    const html = await renderToString(createSSRApp(RiskNodeDetails, { node, graph }))
    expect(html).toContain(node.name)
    expect(html).toContain(node.description)
    expect(html).toContain('AI 推测 / 待核实')
    expect(html).toContain(node.evidence[0]!.quote)
    expect(html).toContain(report.output.evidenceGaps[0]!.neededEvidence)
    expect(html).toContain(report.output.improvements[0]!.action)
    expect(html).toContain('不代表因果关系')
    expect(html).toContain('关闭风险详情')
  })
})
