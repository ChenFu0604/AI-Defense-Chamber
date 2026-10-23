import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import DefenseReportView from '../views/DefenseReportView.vue'
import { useDefenseStore } from '../stores/defense'
import { useReportStore } from '../stores/report'
import { endedReportSession, reportFixture, reportAnswerId, reportQuote } from '../../../../tests/fixtures/report'

afterEach(() => vi.restoreAllMocks())
// SSR awaits the lazy radar module. Compile its real dependencies before measuring
// the report assertions; the chart itself is exercised in chart-appearance.test.ts.
beforeAll(async () => { await import('../components/report/AbilityRadar.vue') })

async function renderReport(closingOnly = false) {
  const session = endedReportSession(), pinia = createPinia()
  const defense = useDefenseStore(pinia), reports = useReportStore(pinia)
  if (closingOnly) session.closingFeedback = {
    answerMessageId: reportAnswerId,
    assessment: { answerQuote: reportQuote, evaluation: 'evidence_missing', feedback: '访谈计划清楚，接下来补齐原始记录。', nextStrategy: 'probe_evidence', risks: [] },
    model: 'fixture-model',
  }
  defense.session = session
  reports.report = reportFixture()
  reports.status = 'success'
  vi.spyOn(defense, 'load').mockResolvedValue()
  vi.spyOn(reports, 'leave').mockImplementation(() => {})
  vi.spyOn(reports, 'load').mockResolvedValue()
  const generate = vi.spyOn(reports, 'generate')
  const placeholder = { render: () => null }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/tasks', name: 'improvement-tasks', component: placeholder },
    { path: '/defense/sessions/:id/report', component: placeholder },
    { path: '/defense/sessions/:id', name: 'defense-session', component: placeholder },
    { path: '/history/:id', name: 'history-detail', component: placeholder },
    { path: '/defense/sessions/:id/risks', name: 'session-risks', component: placeholder },
  ] })
  await router.push(`/defense/sessions/${session.id}/report`)
  const html = await renderToString(createSSRApp({ render: () => h(DefenseReportView) }).use(pinia).use(router))
  return { html, generate }
}

describe('report reading layout', () => {
  it('keeps saved scores, useful actions and transcript anchors accessible without regenerating', async () => {
    const { html, generate } = await renderReport()
    expect(html).toContain(reportFixture().output.summary)
    expect(html.indexOf('下一次答辩前的行动清单')).toBeLessThan(html.indexOf('分项评分与回答依据'))
    for (const target of ['report-evaluation', 'report-training', 'report-feedback', 'report-transcript', `answer-${reportAnswerId}`]) {
      expect(html).toContain(`href="#${target}"`)
      expect(html).toContain(`id="${target}"`)
    }
    expect(generate).not.toHaveBeenCalled()
  })

  it('does not claim evaluation is missing when final-answer feedback exists', async () => {
    const { html } = await renderReport(true)
    expect(html).toContain('访谈计划清楚，接下来补齐原始记录。')
    expect(html).not.toContain('尚无成功保存的回答分析')
  })
})
