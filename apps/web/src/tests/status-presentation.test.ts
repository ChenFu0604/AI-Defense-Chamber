import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import StatusNotice from '../components/ui/StatusNotice.vue'
import RequestWait from '../components/ui/RequestWait.vue'
import DefenseActivity from '../components/defense/DefenseActivity.vue'

describe('contextual operation feedback', () => {
  it('keeps error details and a real retry action together with an accessible alert', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(StatusNotice,
      { title: '本次分析未完成', tone: 'error' },
      { default: () => '连接失败，已保存的资料仍可读取。', actions: () => h('button', { type: 'button' }, '重试分析') },
    ) }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('本次分析未完成')
    expect(html).toContain('连接失败，已保存的资料仍可读取。')
    expect(html).toContain('class="status-notice-actions"')
    expect(html).toContain('重试分析')
  })

  it('does not announce static descriptions and hides inactive waiting UI', async () => {
    const staticHtml = await renderToString(createSSRApp(StatusNotice, { announce: false, title: '模拟数据说明' }))
    expect(staticHtml).not.toMatch(/role="(?:status|alert)"/)
    const inactive = await renderToString(createSSRApp(RequestWait, { active: false }))
    expect(inactive).not.toContain('本页已等待')
  })

  it('groups a request title, elapsed time and recovery guidance without fabricated progress', async () => {
    const html = await renderToString(createSSRApp(RequestWait, { active: true, label: '正在生成诊断报告', requestKey: 'one' }))
    expect(html).toContain('正在生成诊断报告')
    expect(html).toContain('status-notice-title')
    expect(html).toContain('status-notice-meta')
    expect(html).toContain('aria-hidden="true">本页已等待')
    expect(html).toContain('等待时间不代表完成进度')
    expect(html.match(/role="status"/g)).toHaveLength(1)
    expect(html).not.toMatch(/role="progressbar"|\d+%/)
  })

  it('embeds the timer under judge activity without a second status panel or nested live region', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(DefenseActivity,
      { judgeId: 'business', hasMessages: true, phase: 'generating', demo: false },
      { default: () => h(RequestWait, { active: true, embedded: true, requestKey: 'two' }) },
    ) }))
    expect(html).toContain('defense-activity-details')
    expect(html).toContain('request-wait is-embedded')
    expect(html).toContain('无需重复提交')
    expect(html.match(/role="status"/g)).toHaveLength(1)
    expect(html).not.toContain('status-notice-title')
  })
})
