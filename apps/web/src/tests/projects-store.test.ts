import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectsStore } from '../stores/projects'
import { useProjectForm } from '../composables/useProjectForm'
import { PROJECT_STORAGE_KEY } from '../services/project-storage'
import { serverRequest, ServerApiError } from '../services/server-api'
import { fixtureProject, MemoryStorage, validInput } from './project-fixtures'
import { createWorkspaceApiFixture } from './server-workspace-fixture'
vi.mock('../services/server-api', async original => ({...(await original<typeof import('../services/server-api')>()), serverRequest: vi.fn()}))
const api = vi.mocked(serverRequest)
let storage: MemoryStorage, backend: ReturnType<typeof createWorkspaceApiFixture>
beforeEach(() => {
  setActivePinia(createPinia()); storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage)
  backend = createWorkspaceApiFixture(); api.mockReset(); api.mockImplementation(backend.request)
})
afterEach(() => vi.unstubAllGlobals())

describe('authoritative project state', () => {
  it('saves normalized server data and restores in a fresh store without formal local writes', async () => {
    const store = useProjectsStore()
    const project = await store.createProject({...validInput, name: ' 校园节能助手 '})
    expect(store.findProject(project.id)?.name).toBe('校园节能助手')
    expect(storage.data.has(PROJECT_STORAGE_KEY)).toBe(false)
    setActivePinia(createPinia()); const restored = useProjectsStore()
    await restored.loadProjects(); expect(restored.findProject(project.id)).toEqual(project)
    expect(restored.loaded).toBe(true)
  })
  it('preserves server records missing from stale page memory', async () => {
    const store = useProjectsStore(); await store.loadProjects()
    backend.workspace.projects.push(fixtureProject())
    const created = await store.createProject(validInput)
    expect(store.projects.map(project => project.id)).toEqual([created.id, fixtureProject().id])
  })
  it('exposes saving state and rejects duplicate submission', async () => {
    const store = useProjectsStore(), first = store.createProject(validInput)
    expect(store.saving).toBe(true)
    await expect(store.createProject(validInput)).rejects.toThrow('请勿重复提交')
    await first; expect(store.saving).toBe(false); expect(store.projects).toHaveLength(1)
  })
  it('does not invent a saved record after request failure and supports retry', async () => {
    const store = useProjectsStore(); await store.loadProjects()
    backend.failNext(new ServerApiError('DATABASE_ERROR', '服务端保存失败，填写内容已保留。'))
    await expect(store.createProject(validInput)).rejects.toThrow('保存失败')
    expect(store.projects).toHaveLength(0); expect(store.saveError).toContain('填写内容已保留')
    await store.createProject(validInput); expect(store.projects).toHaveLength(1); expect(store.saveError).toBe('')
  })
  it('never silently loads existing local records when the backend fails', async () => {
    storage.data.set(PROJECT_STORAGE_KEY, JSON.stringify({version: 1, projects: [fixtureProject()]}))
    backend.failNext(new ServerApiError('NETWORK_ERROR', '服务端不可用'))
    const store = useProjectsStore(); expect(await store.loadProjects()).toBe(false)
    expect(store.loaded).toBe(false); expect(store.projects).toEqual([]); expect(store.loadError).toBe('服务端不可用')
  })
  it('works with unavailable browser storage because formal data is server-owned', async () => {
    vi.stubGlobal('localStorage', undefined)
    const store = useProjectsStore(); await store.createProject(validInput)
    expect(store.projects).toHaveLength(1); expect(store.loaded).toBe(true)
  })
  it('reuses the request ID after an uncertain response instead of duplicating the project', async () => {
    backend.failAfterCommit()
    const store = useProjectsStore()
    await expect(store.createProject(validInput)).rejects.toThrow('无法确认')
    expect(store.projects).toHaveLength(0); expect(backend.workspace.projects).toHaveLength(1)
    const result = await store.createProject(validInput)
    const creates = api.mock.calls.filter(([, , options]) => options?.method === 'POST')
    expect(creates[0]![2]!.body).toEqual(creates[1]![2]!.body)
    expect(result.id).toBe(backend.workspace.projects[0]!.id); expect(backend.workspace.projects).toHaveLength(1)
  })
  it('validates input without issuing a request', async () => {
    const store = useProjectsStore(); await expect(store.createProject({...validInput, name: ''})).rejects.toThrow()
    expect(api).not.toHaveBeenCalled(); expect(store.projects).toHaveLength(0)
  })
  it('shows the three newest server projects', async () => {
    const store = useProjectsStore()
    for (const name of ['第一项', '第二项', '第三项', '第四项']) await store.createProject({...validInput, name})
    expect(store.recentProjects.map(project => project.name)).toEqual(['第四项', '第三项', '第二项'])
  })
  it('deduplicates concurrent reads and ignores a stale read completed after a write', async () => {
    let resolve!: (value: unknown) => void
    api.mockImplementationOnce(() => new Promise(done => {resolve = done}))
    const store = useProjectsStore(), first = store.loadProjects(), second = store.loadProjects()
    expect(api).toHaveBeenCalledTimes(1)
    const record = await store.createProject(validInput)
    resolve({version: 1, projects: [], revisions: [], archivedIds: []})
    await Promise.all([first, second]); expect(store.findProject(record.id)).toEqual(record)
    expect(store.loading).toBe(false)
  })
  it('forces a fresh post-import list instead of reusing an older in-flight read', async () => {
    let completeOld!: (value: unknown) => void, completeFresh!: (value: unknown) => void
    api.mockImplementationOnce(() => new Promise(resolve => { completeOld = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { completeFresh = resolve }))
    const store = useProjectsStore(), old = store.loadProjects(), fresh = store.loadProjects(true)
    expect(api).toHaveBeenCalledTimes(2)
    completeOld({version: 1, projects: [], revisions: [], archivedIds: []})
    expect(await old).toBe(false)
    expect(store.loading).toBe(true)
    completeFresh({version: 1, projects: [fixtureProject()], revisions: [], archivedIds: []})
    expect(await fresh).toBe(true)
    expect(store.projects).toEqual([fixtureProject()])
    expect(store.loading).toBe(false)
  })
})

describe('project form submission', () => {
  it('collects field errors and never saves an empty form', async () => {
    const form = useProjectForm(); expect(await form.submit()).toBeNull(); expect(form.errorSummary.value).toHaveLength(6)
    expect(api).not.toHaveBeenCalled(); form.form.name = '项目名称'; form.validateField('name'); expect(form.errors.value.name).toBeUndefined()
  })
  it('preserves all input when the server save fails', async () => {
    const form = useProjectForm(); Object.assign(form.form, validInput)
    backend.failNext(new Error('服务端保存失败'))
    expect(await form.submit()).toBeNull(); expect(form.form).toEqual(validInput); expect(form.errors.value).toEqual({})
    expect(useProjectsStore().saveError).toContain('保存失败'); expect(useProjectsStore().saving).toBe(false)
  })
  it('returns only a confirmed server record', async () => {
    const form = useProjectForm(); Object.assign(form.form, validInput)
    const result = await form.submit(); expect(result?.id).toBeTruthy(); expect(backend.workspace.projects).toEqual([result])
  })
})
