import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, ref, type EffectScope } from 'vue'
import { type RetrainRequest, type HistoryEntry, type AnalysisRecord } from '@defense/shared'
import { useRetrainingPreparation } from '../composables/useRetrainingPreparation'
import { requestProjectAnalysis, AnalysisApiError } from '../services/analysis-api'
import { defenseApi, DefenseApiError } from '../services/defense-api'
import { readPendingCreation } from '../services/history-storage'
import { writeProjectWorkspace } from '../services/project-storage'
import { saveAnalysisRecord } from '../services/analysis-storage'
import { useProjectsStore } from '../stores/projects'
import { useImprovementsStore } from '../stores/improvements'
import { endedReportSession, reportFixture } from '../../../../tests/fixtures/report'
import { MemoryStorage } from './project-fixtures'

vi.mock('../services/analysis-api', async original => ({...(await original<typeof import('../services/analysis-api')>()), requestProjectAnalysis: vi.fn()}))
vi.mock('../services/defense-api', async original => ({...(await original<typeof import('../services/defense-api')>()), defenseApi: vi.fn()}))
const api = vi.mocked(defenseApi), analyze = vi.mocked(requestProjectAnalysis)
const scopes: EffectScope[] = []
const source = endedReportSession()
const project = {...source.project, technicalPlan: source.project.technicalPlan + ' 新增了失败恢复方案。', updatedAt: '2026-10-23T01:00:00.000Z'}
const profile = {...source.analysis, id: crypto.randomUUID(), projectSnapshot: {...source.analysis.projectSnapshot, technicalPlan: project.technicalPlan}}
function setup() {
  const scope = effectScope(); scopes.push(scope)
  const entry = ref<HistoryEntry>({session: structuredClone(source), report: reportFixture(), archivedAt: new Date().toISOString()})
  const preparation = scope.run(() => useRetrainingPreparation(ref(source.id), entry, ref('')))!
  return {preparation, scope}
}
beforeEach(() => {
  setActivePinia(createPinia()); vi.stubGlobal('localStorage', new MemoryStorage())
  writeProjectWorkspace({version: 1, projects: [project], revisions: [], archivedIds: []})
  useProjectsStore().loadProjects()
  api.mockReset(); analyze.mockReset(); analyze.mockResolvedValue(profile)
  api.mockImplementation(async (_url, body) => {
    const input = body as RetrainRequest
    return {...structuredClone(source), id: input.requestId, project: input.current?.project ?? source.project,
      analysis: input.current?.analysis ?? source.analysis, messages: [], status: 'ready', currentQuestionId: null, endedAt: null,
      training: {sourceSessionId: source.id, sourceReportId: reportFixture().id, focus: ['补充证据']}}
  })
})
afterEach(() => { scopes.splice(0).forEach(s => s.stop()); vi.unstubAllGlobals() })
describe('current-version targeted training preparation', () => {
  it('requires confirmation, generates a matching current profile, includes saved task progress and prevents double submit', async () => {
    const tasks = useImprovementsStore(); tasks.add(reportFixture(), 0, project.name)
    tasks.update(tasks.tasks[0]!, {status: 'done', note: '已整理匿名访谈记录'})
    const {preparation: ui} = setup()
    ui.sourceMode.value = 'current'; ui.selectedIds.value = [tasks.tasks[0]!.id]
    expect(await ui.start()).toBeNull()
    ui.confirmed.value = true
    const running = ui.start()
    expect(await ui.start()).toBeNull()
    const result = await running
    expect(result?.project).toEqual(project)
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(api).toHaveBeenCalledTimes(1)
    expect(api.mock.calls[0]![1]).toMatchObject({current: {project, analysis: profile}, taskUpdates: [{improvementIndex: 0, status: 'done', note: '已整理匿名访谈记录'}]})
  })
  it('reuses a current real profile and leaves original-snapshot training free of analysis calls', async () => {
    saveAnalysisRecord(profile)
    const {preparation: ui} = setup()
    ui.sourceMode.value = 'current'; ui.confirmed.value = true
    await ui.start()
    expect(analyze).not.toHaveBeenCalled()
    ui.sourceMode.value = 'original'; ui.confirmed.value = true
    await ui.start()
    expect(api.mock.calls[1]![1]).not.toHaveProperty('current')
    expect(analyze).not.toHaveBeenCalled()
  })
  it('shows an analysis/configuration failure without creating or switching to demo', async () => {
    analyze.mockRejectedValueOnce(new AnalysisApiError('AI_NOT_CONFIGURED', '请先配置模型'))
    const {preparation: ui} = setup()
    ui.sourceMode.value = 'current'; ui.confirmed.value = true
    expect(await ui.start()).toBeNull()
    expect(ui.error.value).toBe('请先配置模型')
    expect(api).not.toHaveBeenCalled()
    expect(await ui.start()).toBeTruthy()
  })
  it('retains a failed creation and safely replays its full snapshot after refreshing', async () => {
    api.mockRejectedValueOnce(new Error('网络中断'))
    const first = setup().preparation
    first.sourceMode.value = 'current'; first.confirmed.value = true
    expect(await first.start()).toBeNull()
    const pending = readPendingCreation()!
    expect(first.pending.value).toEqual(pending)
    const next = setup().preparation
    next.confirmed.value = true
    expect((await next.retryPending())?.id).toBe(pending.input.requestId)
    expect(api.mock.calls[1]![1]).toEqual(pending.input)
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(readPendingCreation()).toBeNull()
  })
  it('allows correcting explicitly rejected input while preserving uncertain network requests', async () => {
    api.mockRejectedValueOnce(new DefenseApiError('ATTACHMENT_NOT_FOUND', '请重新上传材料'))
    const {preparation: ui} = setup()
    ui.confirmed.value = true
    expect(await ui.start()).toBeNull()
    expect(readPendingCreation()).toBeNull()
    expect(ui.pending.value).toBeNull()
    expect(await ui.start()).toBeTruthy()
    expect((api.mock.calls[0]![1] as RetrainRequest).requestId).not.toBe((api.mock.calls[1]![1] as RetrainRequest).requestId)
  })
  it('does not create from a project changed during analysis or a response completed after leaving', async () => {
    let finish!: (record: AnalysisRecord) => void
    analyze.mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const {preparation: ui} = setup()
    ui.sourceMode.value = 'current'; ui.confirmed.value = true
    const running = ui.start()
    writeProjectWorkspace({version: 1, projects: [{...project, description: '另一页面的新内容'}], revisions: [], archivedIds: []})
    finish(profile)
    expect(await running).toBeNull()
    expect(ui.error.value).toContain('分析期间')
    expect(api).not.toHaveBeenCalled()
    writeProjectWorkspace({version: 1, projects: [project], revisions: [], archivedIds: []})
    // A separate scope with no cache exercises disposal while a model request is pending.
    setActivePinia(createPinia()); useProjectsStore().loadProjects()
    vi.stubGlobal('localStorage', new MemoryStorage())
    writeProjectWorkspace({version: 1, projects: [project], revisions: [], archivedIds: []})
    analyze.mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const other = setup()
    other.preparation.sourceMode.value = 'current'; other.preparation.confirmed.value = true
    const stopped = other.preparation.start(); other.scope.stop(); finish(profile)
    expect(await stopped).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })
})
