import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createImprovementTask, type ImprovementTask } from '@defense/shared'
import ImprovementTaskCard from '../components/improvements/ImprovementTaskCard.vue'
import { reportFixture } from '../../../../tests/fixtures/report'

function task(overrides: Partial<ImprovementTask> = {}) {
  return {...createImprovementTask(reportFixture(), 0, '校园需求验证项目',
    '11111111-1111-4111-8111-111111111111', '2026-10-25T00:00:00.000Z'), ...overrides}
}
async function render(value: ImprovementTask) {
  const placeholder = {render: () => null}
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/tasks', component: placeholder},
    {path: '/history/:id/train', name: 'history-train', component: placeholder},
    {path: '/defense/sessions/:id/report', name: 'defense-report', component: placeholder},
  ]})
  await router.push('/tasks')
  return renderToString(createSSRApp(ImprovementTaskCard, {task: value}).use(createPinia()).use(router))
}

describe('compact improvement task and progress editor', () => {
  it('separates the actual action, completion criteria and saved progress without inventing verification', async () => {
    const value = task({status: 'in_progress', note: '已整理访谈原文。\n尚待核对样本偏差。'})
    const html = await render(value)
    for (const text of [value.projectName, value.title, value.action, value.acceptanceCriteria, value.note]) expect(html).toContain(text)
    expect(html).toContain('aria-label="下一步行动"')
    expect(html).toContain('aria-label="完成标准"')
    expect(html).toContain('aria-label="最新进展"')
    const statusClasses = /<span class="([^"]*\bimprovement-status\b[^"]*)"/.exec(html)?.[1]?.split(/\s+/)
    expect(statusClasses).toEqual(expect.arrayContaining(['improvement-status', 'is-in_progress']))
    expect(html).not.toMatch(/class="improvement-status[^"]*"[^>]*>已通过验证/)
    expect(html).toContain(`/history/${value.sourceSessionId}/train?task=${value.id}`)
    expect(html).toContain(`/defense/sessions/${value.sourceSessionId}/report`)
  })

  it('keeps status self-reported and omits a progress block when no note is saved', async () => {
    const html = await render(task({status: 'done', note: ''}))
    expect(html).toContain('已完成（自行记录）')
    expect(html).not.toContain('aria-label="最新进展"')
    expect(html).toContain('已完成表示自行记录，不代表已通过验证')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
  })

  it('names the editor fields, links their hints and count, and offers a non-saving return action', async () => {
    const html = await render(task())
    const field = html.match(/<textarea\b[^>]*id="([^"]+-note)"[^>]*>/)?.[0]
    const id = /id="([^"]+)"/.exec(field ?? '')?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`for="${id}"`)
    expect(field).toContain('maxlength="2000"')
    expect(field).toContain(`aria-describedby="${id}-hint ${id}-count"`)
    expect(html).toContain(`id="${id}-hint"`)
    expect(html).toContain(`id="${id}-count"`)
    expect(html).toContain('返回任务')
    expect(html).toContain('保存进展')
    expect(html).toContain('关闭窗口保留本页输入，不会自动保存')
    expect(html).toMatch(/<details class="improvement-editor-materials">/)
    expect(html).toContain('补充证据材料')
  })

  it('gives editor controls their own visible surface and focus state without changing native toggles', () => {
    const css = readFileSync(new URL('../styles/improvements.css', import.meta.url), 'utf8')
    const control = /\.improvement-editor \.form-field :is\(select, textarea\) \{([^}]+)\}/.exec(css)?.[1]
    expect(control).toMatch(/border: 1px solid #[a-f\d]{6}/)
    expect(control).toContain('padding: 11px 13px')
    expect(control).toContain('background: var(--surface-subtle)')
    expect(control).not.toContain('checkbox')
    expect(css).toContain('.improvement-editor .form-field :is(select, textarea):focus')
    expect(css).toContain('@media (max-width: 700px)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
