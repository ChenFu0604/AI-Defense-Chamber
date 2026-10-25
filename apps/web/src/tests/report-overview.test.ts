import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import ReportSessionOverview from '../components/report/ReportSessionOverview.vue'

const path = '/defense/sessions/11111111-1111-4111-8111-111111111111/report'
const sections = ['report-evaluation', 'report-training', 'report-feedback', 'report-transcript']
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
function links(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match => ({
    href: /href="([^"]+)"/.exec(match[1]!)?.[1],
    current: /aria-current="([^"]+)"/.exec(match[1]!)?.[1],
    label: text(match[2]!),
  }))
}
async function setup(hash = '', props = {projectName: '校园节能助手', mode: 'live' as 'live' | 'demo', answers: 5}) {
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/defense/sessions/:id/report', component: {render: () => null}},
  ]})
  await router.push({path, query: {source: 'history'}, hash})
  await router.isReady()
  const render = () => renderToString(createSSRApp(ReportSessionOverview, props).use(router))
  return {router, render}
}

describe('report session overview', () => {
  it('keeps the full project name, saved answer count and subjective assessment disclosure', async () => {
    const name = '面向校园二手物品循环使用与信息互助的项目'.repeat(6)
    const {render} = await setup('', {projectName: name, mode: 'live', answers: 5})
    const html = await render(), content = text(html)
    expect(content).toContain(name)
    expect(content).toContain('真实答辩记录')
    expect(content).toContain('AI 主观训练建议')
    expect(content).toContain('已保存 5 次回答')
    expect(content).not.toContain('综合评分')
    expect(content).not.toContain('100 分')
  })

  it('shows a real zero count without inventing a score or completed answers', async () => {
    const {render} = await setup('', {projectName: '尚未回答的训练', mode: 'live', answers: 0})
    expect(text(await render())).toContain('已保存 0 次回答')
    expect(text(await render())).not.toContain('已保存 5 次回答')
  })

  it('clearly labels the simulated source instead of calling it a real defense record', async () => {
    const {render} = await setup('', {projectName: '模拟练习', mode: 'demo', answers: 2})
    const content = text(await render())
    expect(content).toMatch(/模拟(?:诊断|演示|会话)/)
    expect(content).toContain('未调用模型')
    expect(content).not.toContain('真实答辩记录')
    expect(content).toContain('已保存 2 次回答')
  })

  it('keeps all four report anchors on the same route and preserves history query parameters', async () => {
    const {render} = await setup()
    const navigation = links(await render())
    expect(navigation).toHaveLength(4)
    expect(navigation.map(link => link.href)).toEqual(sections.map(id => path + '?source=history#' + id))
    expect(navigation.filter(link => link.current === 'location')).toEqual([
      expect.objectContaining({href: path + '?source=history#report-evaluation'}),
    ])
    expect(navigation.some(link => link.current === 'page')).toBe(false)
  })

  it('tracks section navigation and maps answer-reference deep links to the transcript', async () => {
    const {router, render} = await setup('#report-feedback')
    expect(links(await render()).find(link => link.current === 'location')?.href).toBe(path + '?source=history#report-feedback')
    await router.push({path, query: {source: 'history'}, hash: '#answer-33333333-3333-4333-8333-333333333333'})
    const navigation = links(await render())
    expect(navigation.filter(link => link.current === 'location')).toHaveLength(1)
    expect(navigation.some(link => link.current === 'page')).toBe(false)
    expect(navigation.find(link => link.current === 'location')?.href).toBe(path + '?source=history#report-transcript')
  })
})
