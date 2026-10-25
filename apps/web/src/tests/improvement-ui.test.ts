import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useImprovementsStore } from '../stores/improvements'
import { useProjectsStore } from '../stores/projects'
import { archiveSession, archiveReport } from '../services/history-storage'
import { writeProjectWorkspace } from '../services/project-storage'
import { IMPROVEMENT_STORAGE_KEY } from '../services/improvement-storage'
import ImprovementTasksView from '../views/ImprovementTasksView.vue'
import HistoryTrainView from '../views/HistoryTrainView.vue'
import { endedReportSession, reportFixture } from '../../../../tests/fixtures/report'
import { MemoryStorage } from './project-fixtures'
let storage: MemoryStorage
beforeEach(() => { setActivePinia(createPinia()); storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage) })
afterEach(() => vi.unstubAllGlobals())
async function render(component: Component, path = '/tasks') {
  const pinia = createPinia()
  const tasks = useImprovementsStore(pinia), projects = useProjectsStore(pinia)
  tasks.load(); projects.loadProjects()
  const empty = {render: () => null}
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/tasks', name: 'improvement-tasks', component: empty}, {path: '/history', component: empty},
    {path: '/projects/new', component: empty}, {path: '/history/:id', name: 'history-detail', component: empty},
    {path: '/history/:id/train', name: 'history-train', component: empty},
    {path: '/defense/sessions/:id/report', name: 'defense-report', component: empty},
    {path: '/defense/sessions/:id', name: 'defense-session', component: empty},
  ]})
  await router.push(path)
  return renderToString(createSSRApp({render: () => h(component)}).use(pinia).use(router))
}
describe('improvement task and retraining screens', () => {
  it('renders an actionable empty state and preserves damaged data behind an error state', async () => {
    const html = await render(ImprovementTasksView)
    expect(html).toContain('从一份报告开始改进')
    expect(html).toContain('href="/history"')
    expect(html).toContain('href="/projects/new"')
    storage.data.set(IMPROVEMENT_STORAGE_KEY, 'broken')
    const error = await render(ImprovementTasksView)
    expect(error).toContain('数据损坏')
    expect(error).not.toContain('从一份报告开始改进')
    expect(storage.data.get(IMPROVEMENT_STORAGE_KEY)).toBe('broken')
  })
  it('shows saved task details, evidence controls, source and targeted training links', async () => {
    const tasks = useImprovementsStore(), report = reportFixture()
    tasks.add(report, 0, '校园项目')
    tasks.update(tasks.tasks[0]!, {status: 'done', note: '已整理3次访谈，尚未验证付费。'})
    const html = await render(ImprovementTasksView)
    expect(html).toContain(report.output.improvements[0]!.acceptanceCriteria)
    expect(html).toContain('已整理3次访谈，尚未验证付费。')
    expect(html).toContain('已完成（自行记录）')
    expect(html).toContain('补充证据材料')
    expect(html).toContain(`<dialog`)
    expect(html).toContain(`/history/${report.sessionId}/train?task=`)
    expect(await render(ImprovementTasksView, '/tasks?project=' + crypto.randomUUID())).toContain('没有符合筛选条件')
  })
  it('offers current/original snapshots and the exact saved tasks on the retraining page', async () => {
    const source = endedReportSession(), report = reportFixture()
    archiveSession(source); archiveReport(report)
    writeProjectWorkspace({version: 1, projects: [source.project], revisions: [], archivedIds: []})
    const tasks = useImprovementsStore(); tasks.add(report, 0, source.project.name)
    tasks.update(tasks.tasks[0]!, {status: 'in_progress', note: '还在收集试点记录'})
    const html = await render(HistoryTrainView, `/history/${source.id}/train?task=${tasks.tasks[0]!.id}`)
    expect(html).toContain('当前浏览器保存的最新版本')
    expect(html).toContain('原答辩资料与画像')
    expect(html).toContain('还在收集试点记录')
    const selected = html.match(new RegExp(`<input[^>]*id="retrain-task-${tasks.tasks[0]!.id}"[^>]*>`))?.[0]
    expect(selected).toMatch(/\bchecked\b/)
    expect(html).toContain('不会自动认定已完成验证')
    expect(html).toContain('id="retraining-source-heading"')
    expect(html).toContain('id="retraining-focus-heading"')
    expect(html).toContain('id="retraining-start-heading"')
    expect(html).toContain('原训练回顾 · 沿用训练方式、目标与题数')
    expect(html).toContain('已选 1 / 5')
    const choiceClasses = /<label class="([^"]*\bretraining-task-choice\b[^"]*)"/.exec(html)?.[1]?.split(/\s+/)
    expect(choiceClasses).toEqual(expect.arrayContaining(['retraining-task-choice', 'is-selected']))
  })
  it('keeps the compact filter controls named, reports the real count and groups its disclosure', async () => {
    const report = reportFixture(), tasks = useImprovementsStore()
    tasks.add(report, 0, '校园项目')
    const html = await render(ImprovementTasksView, '/tasks?project=' + report.projectId + '&source=report')
    expect(html).toContain('aria-label="筛选改进任务"')
    for (const field of ['project', 'status']) {
      expect(html).toContain(`for="improvement-${field}-filter"`)
      expect(html).toContain(`id="improvement-${field}-filter"`)
    }
    expect(html).toContain('<strong>1</strong> 项任务')
    expect(html).toContain('清除项目和状态筛选')
    expect(html).toContain('导出任务记录')
    const start = html.indexOf('class="improvement-filters'), end = html.indexOf('class="improvement-list')
    const disclosure = html.indexOf('不含附件原文件')
    expect(disclosure).toBeGreaterThan(start)
    expect(disclosure).toBeLessThan(end)
    expect(await render(ImprovementTasksView, '/tasks')).not.toContain('清除项目和状态筛选')
  })
  it('explains unavailable current materials and missing tasks without blocking original-snapshot training', async () => {
    const source = endedReportSession(), report = reportFixture()
    archiveSession(source); archiveReport(report)
    const html = await render(HistoryTrainView, `/history/${source.id}/train`)
    const unavailable = html.match(/<input[^>]*value="current"[^>]*>/)?.[0]
    expect(unavailable).toMatch(/\bdisabled\b/)
    expect(html).toContain('当前浏览器未找到原项目，可以沿用原资料训练')
    expect(html).toContain('还没有加入改进任务')
    expect(html).toContain('已选 0 / 5')
    expect(html).toContain('去报告中加入改进任务')
    expect(html).toContain('创建薄弱点训练会话')
  })
})
