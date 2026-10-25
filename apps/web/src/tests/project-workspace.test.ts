import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, type EffectScope } from 'vue'
import { projectInputSchema } from '@defense/shared'
import { useProjectsStore } from '../stores/projects'
import { useProjectForm } from '../composables/useProjectForm'
import { PROJECT_STORAGE_KEY, readProjectWorkspace, writeProjects } from '../services/project-storage'
import { PROJECT_DRAFTS_KEY, readProjectDrafts } from '../services/project-drafts'
import { useAnalysisStore } from '../stores/analysis'
import { archiveSession, readHistory } from '../services/history-storage'
import { analysisFixture, analysisProject } from '../../../../tests/fixtures/analysis'
import { defenseFixture } from '../../../../tests/fixtures/defense'
import { fixtureProject, MemoryStorage, validInput } from './project-fixtures'
import { serverRequest, ServerApiError } from '../services/server-api'
import { createWorkspaceApiFixture } from './server-workspace-fixture'
vi.mock('../services/server-api', async original => ({...(await original<typeof import('../services/server-api')>()), serverRequest: vi.fn()}))

let storage: MemoryStorage
let backend: ReturnType<typeof createWorkspaceApiFixture>
const scopes: EffectScope[] = []
function form(project?: ReturnType<typeof fixtureProject>) {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useProjectForm({ drafts: true, project }))!
}
beforeEach(() => {
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.useFakeTimers()
  backend = createWorkspaceApiFixture(); vi.mocked(serverRequest).mockReset(); vi.mocked(serverRequest).mockImplementation(backend.request)
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('unfinished project drafts', () => {
  it('automatically saves a short brief and restores unfinished fields without creating a formal project', () => {
    const first = form()
    Object.assign(first.form, { name: '新想法', description: '一句话介绍', targetUsers: '住校学生' })
    expect(first.draftPending.value).toBe(true)
    vi.advanceTimersByTime(500)
    expect(first.draftSavedAt.value).toBeTruthy()
    expect(readProjectWorkspace(storage).projects).toEqual([])
    const restored = form()
    expect(restored.restored.value).toBe(true)
    expect(restored.form.name).toBe('新想法')
    expect(restored.form.technicalPlan).toBe('')
    expect(projectInputSchema.safeParse(restored.form).success).toBe(false)
  })
  it('flushes the last edit when leaving the form scope', () => {
    const draft = form()
    draft.form.name = '离开前的输入'
    scopes[0]!.stop()
    expect(readProjectDrafts(storage)[0]!.input.name).toBe('离开前的输入')
  })
  it('keeps corrupted drafts untouched while preserving current input', () => {
    storage.data.set(PROJECT_DRAFTS_KEY, '{broken')
    const draft = form()
    draft.form.name = '当前输入'
    draft.saveDraft()
    expect(draft.draftError.value).toBeTruthy()
    expect(draft.draftSavedAt.value).toBe('')
    expect(draft.form.name).toBe('当前输入')
    expect(storage.data.get(PROJECT_DRAFTS_KEY)).toBe('{broken')
  })
  it('surfaces quota failures and confirms an unconfirmed write on retry', () => {
    const draft = form()
    draft.form.name = '草稿'
    storage.denyWrites = true
    draft.saveDraft()
    expect(draft.draftError.value).toContain('无法确认')
    expect(draft.draftSavedAt.value).toBe('')
    storage.denyWrites = false
    storage.failNextReadAfterWrite = true
    draft.saveDraft()
    expect(draft.draftSavedAt.value).toBe('')
    storage.denyReads = false
    draft.saveDraft()
    expect(draft.draftError.value).toBe('')
    expect(draft.draftSavedAt.value).toBeTruthy()
    expect(readProjectDrafts(storage)).toHaveLength(1)
  })
  it('does not overwrite another open page’s newer draft', () => {
    const first = form(), second = form()
    first.form.name = '第一页'
    second.form.name = '第二页'
    first.saveDraft()
    second.saveDraft()
    expect(second.draftError.value).toContain('其他页面')
    expect(second.form.name).toBe('第二页')
    expect(readProjectDrafts(storage)[0]!.input.name).toBe('第一页')
  })
  it('separates new and editing drafts, and removes only the completed one', async () => {
    const project = fixtureProject()
    writeProjects([project], storage)
    const editing = form(project), creating = form()
    editing.form.name = '编辑草稿'
    editing.saveDraft()
    Object.assign(creating.form, validInput)
    creating.saveDraft()
    const pending = creating.submit()
    await vi.runAllTimersAsync()
    expect((await pending)?.id).toBeTruthy()
    expect(readProjectDrafts(storage).map((d) => d.key)).toEqual([`edit:${project.id}`])
  })
})

describe('project revisions and reversible archiving', () => {
  it('migrates existing envelopes in memory without rewriting them', () => {
    const raw = JSON.stringify({ version: 1, projects: [fixtureProject()] })
    storage.data.set(PROJECT_STORAGE_KEY, raw)
    expect(readProjectWorkspace(storage)).toMatchObject({ revisions: [], archivedIds: [] })
    expect(storage.data.get(PROJECT_STORAGE_KEY)).toBe(raw)
  })
  it('preserves an old snapshot and historical sessions, invalidates only the current analysis', async () => {
    backend.workspace.projects.push(analysisProject)
    backend.analyses.push(analysisFixture())
    const session = defenseFixture()
    archiveSession(session, storage)
    const previousSession = JSON.stringify(readHistory(storage).entries[0])
    const analyses = useAnalysisStore(), projects = useProjectsStore()
    await projects.loadProjects()
    await analyses.restore(analysisProject)
    expect(analyses.stateFor(analysisProject.id).live).toBeTruthy()
    const updated = await projects.updateProject(analysisProject, { ...analysisProject, name: '修改后的项目' })
    expect(updated.id).toBe(analysisProject.id)
    expect(updated.createdAt).toBe(analysisProject.createdAt)
    expect(updated.updatedAt).not.toBe(analysisProject.updatedAt)
    expect(backend.workspace.revisions[0]!.snapshots).toEqual([analysisProject])
    await analyses.restore(updated)
    expect(analyses.stateFor(updated.id).live).toBeNull()
    expect(analyses.stateFor(updated.id).warning).toContain('资料已变化')
    expect(backend.analyses).toEqual([analysisFixture()])
    expect(JSON.stringify(readHistory(storage).entries[0])).toBe(previousSession)
  })
  it('rejects an edit based on an obsolete snapshot without losing the newer version', async () => {
    const base = fixtureProject(), projects = useProjectsStore()
    backend.workspace.projects.push(base)
    const updated = await projects.updateProject(base, { ...base, name: '他人修改' })
    await expect(projects.updateProject(base, { ...base, name: '过期修改' })).rejects.toThrow('其他页面更新')
    expect(backend.workspace.projects).toEqual([updated])
    expect(backend.workspace.revisions[0]!.snapshots).toHaveLength(1)
  })
  it('does not add a duplicate revision on retry after an unconfirmed edit', async () => {
    const base = fixtureProject(), projects = useProjectsStore()
    backend.workspace.projects.push(base)
    backend.failAfterCommit()
    await expect(projects.updateProject(base, { ...base, name: '新版本' })).rejects.toThrow('无法确认')
    storage.denyReads = false
    const confirmed = await projects.updateProject(base, { ...base, name: '新版本' })
    expect(confirmed.name).toBe('新版本')
    expect(backend.workspace.revisions[0]!.snapshots).toHaveLength(1)
  })
  it('keeps both saved versions and memory intact on a failed edit', async () => {
    const base = fixtureProject(), projects = useProjectsStore()
    backend.workspace.projects.push(base)
    await projects.loadProjects()
    backend.failNext(new ServerApiError('DATABASE_ERROR', '保存失败'))
    await expect(projects.updateProject(base, { ...base, name: '未保存' })).rejects.toThrow('保存失败')
    expect(projects.findProject(base.id)).toEqual(base)
    expect(backend.workspace.revisions).toEqual([])
  })
  it('archives and restores without deleting projects or revision snapshots', async () => {
    const base = fixtureProject(), projects = useProjectsStore()
    backend.workspace.projects.push(base)
    await projects.updateProject(base, { ...base, name: '新版' })
    await projects.setArchived(base.id, true)
    expect(projects.activeProjects).toHaveLength(0)
    expect(projects.projects).toHaveLength(1)
    expect(projects.revisions[0]!.snapshots).toEqual([base])
    await projects.setArchived(base.id, false)
    expect(projects.activeProjects).toHaveLength(1)
    setActivePinia(createPinia())
    const restored = useProjectsStore()
    await restored.loadProjects()
    expect(restored.revisions[0]!.snapshots).toEqual([base])
  })
  it('rejects invalid version references without overwriting source data', () => {
    const raw = JSON.stringify({ version: 1, projects: [], revisions: [{ projectId: fixtureProject().id, snapshots: [fixtureProject()] }] })
    storage.data.set(PROJECT_STORAGE_KEY, raw)
    expect(() => readProjectWorkspace(storage)).toThrow('损坏')
    expect(storage.data.get(PROJECT_STORAGE_KEY)).toBe(raw)
  })
})
