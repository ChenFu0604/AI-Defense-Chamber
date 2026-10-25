import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createImprovementTask, type ImprovementTask, type ServerHistory } from '@defense/shared'
import { useImprovementsStore } from '../stores/improvements'
import { useProjectsStore } from '../stores/projects'
import { useHistoryStore } from '../stores/history'
import { serverRequest } from '../services/server-api'
import ImprovementTasksView from '../views/ImprovementTasksView.vue'
import HistoryTrainView from '../views/HistoryTrainView.vue'
import { endedReportSession, reportFixture } from '../../../../tests/fixtures/report'
import { MemoryStorage } from './project-fixtures'
vi.mock('../services/server-api', () => ({ serverRequest: vi.fn() }))
let records: ImprovementTask[], archive: ServerHistory, projectAvailable: boolean, taskFailure: string
beforeEach(() => {
  setActivePinia(createPinia()); vi.stubGlobal('localStorage', new MemoryStorage())
  records = []; archive = {version: 1, projects: [], analyses: [], entries: []}; projectAvailable = false; taskFailure = ''
  vi.mocked(serverRequest).mockReset().mockImplementation(async path => {
    if (path === '/improvements') { if (taskFailure) throw new Error(taskFailure); return records }
    if (path === '/history') return archive
    if (path === '/projects') return {version: 1, projects: projectAvailable ? [endedReportSession().project] : [], revisions: [], archivedIds: []}
    throw new Error('unexpected path ' + path)
  })
})
afterEach(() => vi.unstubAllGlobals())
async function render(component: Component, path = '/tasks') {
  const pinia = createPinia()
  const tasks = useImprovementsStore(pinia), projects = useProjectsStore(pinia), history = useHistoryStore(pinia)
  await Promise.all([tasks.load(), projects.loadProjects(), history.load()])
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
function setupHistory() {
  const source = endedReportSession(), report = reportFixture()
  archive = {version: 1, projects: [source.project], analyses: [source.analysis], entries: [{session: source, report, archivedAt: report.createdAt}]}
  return {source, report}
}
function savedTask(note = '', status: ImprovementTask['status'] = 'todo') {
  return {...createImprovementTask(reportFixture(), 0, '校园项目', crypto.randomUUID(), '2026-10-25T00:00:00.000Z'), status, note}
}
describe('improvement task and retraining screens', () => {
  it('renders server empty/error states without reading unimported browser task data', async () => {
    const html = await render(ImprovementTasksView)
    expect(html).toContain('从一份报告开始改进')
    expect(html).toContain('href="/history"'); expect(html).toContain('href="/projects/new"')
    localStorage.setItem('defense-chamber.improvements.v1', 'broken')
    taskFailure = '任务读取失败，服务端不可用'
    const error = await render(ImprovementTasksView)
    expect(error).toContain(taskFailure); expect(error).not.toContain('从一份报告开始改进')
    expect(localStorage.getItem('defense-chamber.improvements.v1')).toBe('broken')
  })
  it('shows saved task details, evidence controls, source and targeted training links', async () => {
    const report = reportFixture(), task = savedTask('已整理3次访谈，尚未验证付费。', 'done'); records = [task]
    const html = await render(ImprovementTasksView)
    expect(html).toContain(report.output.improvements[0]!.acceptanceCriteria)
    expect(html).toContain(task.note); expect(html).toContain('已完成（自行记录）')
    expect(html).toContain('补充证据材料'); expect(html).toContain('<dialog')
    expect(html).toContain(`/history/${report.sessionId}/train?task=`)
    expect(await render(ImprovementTasksView, '/tasks?project=' + crypto.randomUUID())).toContain('没有符合筛选条件')
  })
  it('offers current/original snapshots and the exact saved tasks on the retraining page', async () => {
    const {source} = setupHistory(); projectAvailable = true
    const task = savedTask('还在收集试点记录', 'in_progress'); records = [task]
    const html = await render(HistoryTrainView, `/history/${source.id}/train?task=${task.id}`)
    expect(html).toContain('当前保存的最新版本'); expect(html).toContain('原答辩资料与画像'); expect(html).toContain(task.note)
    const selected = html.match(new RegExp(`<input[^>]*id="retrain-task-${task.id}"[^>]*>`))?.[0]
    expect(selected).toMatch(/\bchecked\b/); expect(html).toContain('不会自动认定已完成验证')
    for (const id of ['source', 'focus', 'start']) expect(html).toContain(`id="retraining-${id}-heading"`)
    expect(html).toContain('原训练回顾 · 沿用训练方式、目标与题数'); expect(html).toContain('已选 1 / 5')
    const choiceClasses = /<label class="([^"]*\bretraining-task-choice\b[^"]*)"/.exec(html)?.[1]?.split(/\s+/)
    expect(choiceClasses).toEqual(expect.arrayContaining(['retraining-task-choice', 'is-selected']))
  })
  it('keeps the compact filter controls named, reports the real count and groups its disclosure', async () => {
    const report = reportFixture(); records = [savedTask()]
    const html = await render(ImprovementTasksView, '/tasks?project=' + report.projectId + '&source=report')
    expect(html).toContain('aria-label="筛选改进任务"')
    for (const field of ['project', 'status']) { expect(html).toContain(`for="improvement-${field}-filter"`); expect(html).toContain(`id="improvement-${field}-filter"`) }
    expect(html).toContain('<strong>1</strong> 项任务'); expect(html).toContain('清除项目和状态筛选'); expect(html).toContain('导出任务记录')
    const start = html.indexOf('class="improvement-filters'), end = html.indexOf('class="improvement-list'), disclosure = html.indexOf('不含附件原文件')
    expect(disclosure).toBeGreaterThan(start); expect(disclosure).toBeLessThan(end)
    expect(await render(ImprovementTasksView, '/tasks')).not.toContain('清除项目和状态筛选')
  })
  it('explains unavailable current materials and missing tasks without blocking original-snapshot training', async () => {
    const {source} = setupHistory()
    const html = await render(HistoryTrainView, `/history/${source.id}/train`)
    const unavailable = html.match(/<input[^>]*value="current"[^>]*>/)?.[0]
    expect(unavailable).toMatch(/\bdisabled\b/)
    expect(html).toContain('未找到原项目，可以沿用原资料训练')
    expect(html).toContain('还没有加入改进任务'); expect(html).toContain('已选 0 / 5')
    expect(html).toContain('去报告中加入改进任务'); expect(html).toContain('创建薄弱点训练会话')
  })
})
