import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { DEFENSE_RECENT_KEY, recentDefenseSessions, rememberDefense } from '../services/defense-storage'
import RecentDefenseSessions from '../components/defense/RecentDefenseSessions.vue'
import { MemoryStorage } from './project-fixtures'
import { defenseFixture } from '../../../../tests/fixtures/defense'
import { endedReportSession } from '../../../../tests/fixtures/report'

beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()))
afterEach(() => vi.unstubAllGlobals())

const legacy = () => {
  const session = defenseFixture()
  return { id: session.id, projectId: session.project.id, name: session.project.name, mode: session.mode }
}
async function render(sessions: ReturnType<typeof recentDefenseSessions>) {
  const placeholder = { render: () => null }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: placeholder }, { path: '/history', component: placeholder },
    { path: '/defense/sessions/:id', name: 'defense-session', component: placeholder },
  ] })
  await router.push('/'); await router.isReady()
  return renderToString(createSSRApp(RecentDefenseSessions, { sessions }).use(router))
}

describe('recent defense session entries', () => {
  it('restores old records without adding invented progress or dates', async () => {
    const old = legacy()
    localStorage.setItem(DEFENSE_RECENT_KEY, JSON.stringify([old]))
    expect(recentDefenseSessions()).toEqual([old])
    const html = await render(recentDefenseSessions())
    expect(html).toContain(old.name)
    expect(html).toContain('会话 ' + old.id.slice(0, 8))
    expect(html).toContain('打开记录')
    expect(html).not.toContain('<time')
    expect(html).not.toContain('0 次回答')
    expect(html).not.toContain('>待回答<')
  })
  it('stores actual session metadata and preserves it when legacy callers only remember an entry', () => {
    const session = endedReportSession()
    session.updatedAt = session.endedAt!
    rememberDefense(session)
    expect(recentDefenseSessions()[0]).toMatchObject({
      createdAt: session.createdAt, updatedAt: session.updatedAt, status: 'ended', answerCount: 1,
    })
    rememberDefense({ id: session.id, project: session.project, mode: session.mode })
    expect(recentDefenseSessions()).toHaveLength(1)
    expect(recentDefenseSessions()[0]).toMatchObject({ status: 'ended', answerCount: 1, updatedAt: session.updatedAt })
  })
  it('keeps actual zero answers and updates a saved status without creating false progress', () => {
    const session = defenseFixture()
    rememberDefense(session)
    expect(recentDefenseSessions()[0]).toMatchObject({ status: 'ready', answerCount: 0 })
    session.status = 'generating'
    rememberDefense(session)
    expect(recentDefenseSessions()[0]).toMatchObject({ status: 'generating', answerCount: 0 })
  })
  it('rejects corrupt saved metadata and surfaces failed storage confirmation', () => {
    localStorage.setItem(DEFENSE_RECENT_KEY, JSON.stringify([{ ...legacy(), updatedAt: 'invalid-date' }]))
    expect(() => recentDefenseSessions()).toThrow()
    const storage = new MemoryStorage(); storage.dropWrites = true
    vi.stubGlobal('localStorage', storage)
    expect(() => rememberDefense(defenseFixture())).toThrow('未能确认会话入口已保存')
  })
  it('uses the project name, actual status, saved time and functional record links', async () => {
    const session = endedReportSession()
    rememberDefense(session)
    const html = await render(recentDefenseSessions())
    expect(html).toMatch(new RegExp(`<strong[^>]*>${session.project.name}</strong>`))
    expect(html).toContain('>已结束</span>')
    expect(html).toContain('1 次回答')
    expect(html).toContain(`datetime="${session.updatedAt}"`)
    expect(html).toContain('href="/defense/sessions/' + session.id + '"')
    expect(html).toContain('查看记录')
    expect(html).toContain('href="/history"')
    expect(html).toContain('进度为上次保存状态')
    expect(html).not.toContain('答辩会话 ·')
  })
  it('limits visible cards to five and accurately labels simulated, pending and failed states', async () => {
    const values = Array.from({ length: 7 }, (_, index) => ({ ...legacy(), id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }))
    const html = await render(values.map((value, index) => ({ ...value,
      mode: index === 0 ? 'demo' : 'live', status: index === 1 ? 'failed' : 'awaiting_answer',
    })))
    expect(html.match(/class="recent-training-card"/g)).toHaveLength(5)
    expect(html).toContain('7 场')
    expect(html).toContain('显示最近 5 场')
    expect(html).toContain('模拟演示')
    expect(html).toContain('>待回答</span>')
    expect(html).toContain('打开重试')
    expect(await render([])).not.toContain('<section')
  })
})
