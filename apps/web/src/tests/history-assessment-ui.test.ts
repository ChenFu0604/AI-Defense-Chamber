import { describe, expect, it } from 'vitest'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defenseReportSchema, reportDimensionIds, type DefenseReport } from '@defense/shared'
import { useHistoryStore } from '../stores/history'
import HistoryView from '../views/HistoryView.vue'
import HistoryCompareView from '../views/HistoryCompareView.vue'
import { endedReportSession, reportFixture, reportAnswerId, reportQuote } from '../../../../tests/fixtures/report'

function savedReport(kind: 'legacy' | 'complete' | 'partial' | 'empty', change = 0): DefenseReport {
  const report = reportFixture()
  const scores = [71 + change, 52, 64, 59, 66]
  const dimensions = Object.fromEntries(reportDimensionIds.map((id, index) => {
    const references = [{ messageId: reportAnswerId, quote: reportQuote }]
    if (kind === 'legacy') return [id, { score: scores[index], reason: '旧版保存的评价。', references }]
    const assessed = kind === 'complete' || kind === 'partial' && index < 2
    return [id, { status: assessed ? 'assessed' : 'insufficient', score: assessed ? scores[index] : null,
      reason: assessed ? '本轮回答提供了相关论证。' : '本轮尚未讨论这一维度，需要补充相关问答。', references: assessed ? references : [] }]
  }))
  return defenseReportSchema.parse({ ...report, id: crypto.randomUUID(), sessionId: crypto.randomUUID(),
    version: kind === 'legacy' ? 1 : 2, overallScore: kind === 'legacy' || kind === 'complete' ? Math.round((62.4 + change / 5) * 10) / 10 : null,
    output: { ...report.output, dimensions } })
}

async function render(component: Component, reports: DefenseReport[], path = '/history') {
  const pinia = createPinia(), store = useHistoryStore(pinia)
  const source = endedReportSession()
  store.archive = { version: 1, projects: [source.project], analyses: [], entries: reports.map((report, index) => ({
    session: { ...source, id: report.sessionId, createdAt: `2026-10-20T10:0${index}:00.000Z` }, report,
    archivedAt: report.createdAt,
  })) }
  const empty = { render: () => null }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/history', component: empty }, { path: '/history/compare', component: empty },
    { path: '/history/:id', name: 'history-detail', component: empty },
    { path: '/history/:id/train', name: 'history-train', component: empty },
    { path: '/projects/new', component: empty }, { path: '/projects/:id', name: 'history-project', component: empty },
    { path: '/defense/sessions/:id', name: 'defense-session', component: empty },
    { path: '/defense/sessions/:id/report', name: 'defense-report', component: empty },
  ] })
  await router.push(path)
  return renderToString(createSSRApp({ render: () => h(component) }).use(pinia).use(router))
}

describe('saved report observation coverage in history', () => {
  it('shows incomplete reports and the latest project result without inventing a zero or hiding the report', async () => {
    const html = await render(HistoryView, [savedReport('legacy'), savedReport('partial')])
    expect(html).toContain('观察不足 · 暂不计算综合分')
    expect(html).toContain('已评估 2 / 5 维')
    expect(html).toContain('最近一次已保存报告：观察不足，暂不计算综合分')
    expect(html).toContain('旧版评分 · 观察覆盖未记录')
    expect(html).toContain('<strong>62.4</strong>')
    expect(html).toContain('<strong>—</strong>')
    expect(html).not.toMatch(/null|undefined|<strong>0<\/strong>/)
  })

  it('compares only scored dimensions and explains why incomplete overall scores cannot be compared', async () => {
    const before = savedReport('partial'), after = savedReport('partial', 9)
    const html = await render(HistoryCompareView, [before, after], `/history/compare?before=${before.sessionId}&after=${after.sessionId}`)
    expect(html).toContain('综合分 暂不计算 → 暂不计算')
    expect(html).toContain('未充分评估不代表低分或能力退步')
    expect(html).toContain('已评估 2 / 5 维')
    expect(html).toContain('<td>+9</td>')
    expect(html).toContain('<td>未充分评估')
    expect(html).toContain('观察不足，暂不比较')
    expect(html).not.toContain('class="history-delta')
    expect(html).not.toMatch(/null|NaN|undefined/)
  })

  it('retains both original scores while declining deltas across legacy and current assessment formats', async () => {
    const before = savedReport('legacy'), after = savedReport('complete', 9)
    const html = await render(HistoryCompareView, [before, after], `/history/compare?before=${before.sessionId}&after=${after.sessionId}`)
    expect(html).toContain('综合分 62.4 分 → 64.2 分')
    expect(html).toContain('旧版未记录观察状态，不计算变化')
    expect(html).toContain('旧版评分 · 观察覆盖未记录')
    expect(html).not.toContain('<td>+9</td>')
    expect(html).not.toContain('class="history-delta')
  })

  it('preserves legacy-to-legacy deltas without claiming their observation coverage is known', async () => {
    const before = savedReport('legacy'), after = savedReport('legacy', 9)
    const html = await render(HistoryCompareView, [before, after], `/history/compare?before=${before.sessionId}&after=${after.sessionId}`)
    expect(html).toContain('+1.8 分')
    expect(html).toContain('<td>+9</td>')
    expect(html).toContain('旧版之间的变化仅供回顾')
    expect(html).toContain('观察覆盖未记录')
  })

  it('keeps a wholly unassessed report selectable and never presents it as zero points', async () => {
    const before = savedReport('empty'), after = savedReport('complete')
    const html = await render(HistoryCompareView, [before, after], `/history/compare?before=${before.sessionId}&after=${after.sessionId}`)
    expect(html).toContain('已评估 0 / 5 维')
    expect(html).toContain('综合分 暂不计算 → 62.4 分')
    expect(html).not.toContain('class="history-delta')
    expect(html).not.toMatch(/<td>[+-]?0<\/td>|null|NaN/)
  })
})
