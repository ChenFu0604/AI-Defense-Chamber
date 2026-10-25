import { beforeAll, describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { reportDimensionIds, type DefenseReport, type ReportDimensions } from '@defense/shared'
import ReportResults from '../components/report/ReportResults.vue'
import AbilityRadar from '../components/report/AbilityRadar.vue'
import { endedReportSession, reportFixture } from '../../../../tests/fixtures/report'

beforeAll(async () => { await import('../components/report/AbilityRadar.vue') })

function currentReport(): DefenseReport {
  const saved = reportFixture()
  const dimensions = Object.fromEntries(reportDimensionIds.map(id => [id, {
    ...saved.output.dimensions[id], status: 'assessed',
  }])) as ReportDimensions
  return { ...saved, version: 2, overallScore: 62.4, output: { ...saved.output, dimensions } }
}

async function renderReport(report: DefenseReport) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/tasks', name: 'improvement-tasks', component: { render: () => null } },
  ] })
  await router.push('/tasks')
  return renderToString(createSSRApp({ render: () => h(ReportResults, { report, messages: endedReportSession().messages }) }).use(createPinia()).use(router))
}

describe('report assessment coverage', () => {
  it('shows assessed scores and coverage but no overall score or missing-dimension meters for a partial report', async () => {
    const report = currentReport()
    if (report.version !== 2) throw new Error('Expected current report')
    report.output.dimensions.technical = { status: 'insufficient', score: null, reason: '本场没有讨论技术方案，需要补充实现与验证过程。', references: [] }
    report.output.dimensions.adaptability = { status: 'insufficient', score: null, reason: '没有足够的有效追问供观察。', references: [] }
    report.overallScore = null
    const html = await renderReport(report)
    expect(html).toContain('已评估 3 / 5 个维度')
    expect(html).toContain('观察不足，暂不生成综合分')
    expect(html).toContain('本场没有讨论技术方案，需要补充实现与验证过程。')
    expect(html).toContain('未充分评估')
    expect(html).not.toContain('class="report-score-number"')
    expect(html.match(/<meter\b/g)).toHaveLength(3)
    expect(html).not.toContain('value="0"')
    expect(html).not.toContain('null')
  })

  it('distinguishes no assessed dimensions from an actual zero score', async () => {
    const report = currentReport()
    if (report.version !== 2) throw new Error('Expected current report')
    for (const id of reportDimensionIds) report.output.dimensions[id] = { status: 'insufficient', score: null, reason: '尚无足够观察。', references: [] }
    report.overallScore = null
    const html = await renderReport(report)
    expect(html).toContain('已评估 0 / 5 个维度')
    expect(html).not.toContain('<meter')
    expect(html).not.toContain('class="report-score-number"')
    const full = currentReport()
    if (full.version !== 2) throw new Error('Expected current report')
    full.output.dimensions.logic.score = 0
    full.overallScore = 48.2
    const complete = await renderReport(full)
    expect(complete).toContain('已评估 5 / 5 个维度')
    expect(complete).toContain('value="0"')
    expect(complete).toContain('class="report-score-number"')
    expect(complete).not.toContain('观察不足，暂不生成综合分')
  })

  it('retains the old score and explicitly marks unknown coverage on a saved legacy report', async () => {
    const report = currentReport()
    const dimensions = Object.fromEntries(reportDimensionIds.map(id => {
      const dimension = report.output.dimensions[id]
      return [id, { score: dimension.score!, reason: dimension.reason, references: dimension.references }]
    })) as Extract<DefenseReport, { version: 1 }>['output']['dimensions']
    const legacy: DefenseReport = { ...report, version: 1, overallScore: 62.4, output: { ...report.output, dimensions } }
    const html = await renderReport(legacy)
    expect(html).toContain('旧版报告 · 观察覆盖未标注')
    expect(html).toContain('62.4')
    expect(html.match(/<meter\b/g)).toHaveLength(5)
    expect(html).not.toContain('已评估 5 / 5')
    expect(html).toContain('旧版评分 · 观察状态未记录')
  })

  it('provides actual scores and insufficient labels next to an incomplete radar', async () => {
    const report = currentReport()
    if (report.version !== 2) throw new Error('Expected current report')
    report.output.dimensions.technical = { status: 'insufficient', score: null, reason: '尚未讨论技术。', references: [] }
    const html = await renderToString(createSSRApp({ render: () => h(AbilityRadar, { dimensions: report.output.dimensions }) }))
    expect(html).toContain('未绘制评分多边形')
    expect(html).toContain('71 / 100')
    expect(html).toContain('未充分评估')
    expect(html).not.toContain('null')
    expect(html).not.toContain('0 / 100')
  })
})
