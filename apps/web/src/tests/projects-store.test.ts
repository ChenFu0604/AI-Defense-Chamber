import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectsStore } from '../stores/projects'
import { useProjectForm } from '../composables/useProjectForm'
import { PROJECT_STORAGE_KEY, readProjects, writeProjects } from '../services/project-storage'
import { fixtureProject, MemoryStorage, validInput } from './project-fixtures'

let storage: MemoryStorage
beforeEach(() => {
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('project state', () => {
  it('saves normalized data and restores it in a new store', async () => {
    const store = useProjectsStore()
    const project = await store.createProject({ ...validInput, name: ' 校园节能助手 ' })
    expect(store.findProject(project.id)?.name).toBe('校园节能助手')
    expect(readProjects(storage)).toEqual([project])
    setActivePinia(createPinia())
    const restored = useProjectsStore()
    restored.loadProjects()
    expect(restored.findProject(project.id)).toEqual(project)
    expect(restored.loaded).toBe(true)
  })
  it('preserves persisted projects when memory is stale', async () => {
    const store = useProjectsStore()
    store.loadProjects()
    writeProjects([fixtureProject()], storage)
    const created = await store.createProject(validInput)
    expect(store.projects.map((project) => project.id)).toEqual([created.id, fixtureProject().id])
  })
  it('exposes saving status and rejects duplicate submission', async () => {
    const store = useProjectsStore()
    const first = store.createProject(validInput)
    expect(store.saving).toBe(true)
    await expect(store.createProject(validInput)).rejects.toThrow('请勿重复提交')
    await first
    expect(store.saving).toBe(false)
    expect(store.projects).toHaveLength(1)
  })
  it('does not update memory on a failed write and supports retry', async () => {
    const store = useProjectsStore()
    store.loadProjects()
    storage.denyWrites = true
    await expect(store.createProject(validInput)).rejects.toThrow('项目保存失败')
    expect(store.projects).toHaveLength(0)
    expect(store.saveError).toContain('填写内容已保留')
    expect(store.saving).toBe(false)
    storage.denyWrites = false
    await store.createProject(validInput)
    expect(store.projects).toHaveLength(1)
    expect(store.saveError).toBe('')
  })
  it('does not overwrite malformed data when creating', async () => {
    storage.data.set(PROJECT_STORAGE_KEY, '{broken')
    const store = useProjectsStore()
    store.loadProjects()
    expect(store.loadError).toContain('损坏')
    await expect(store.createProject(validInput)).rejects.toThrow('损坏')
    expect(storage.data.get(PROJECT_STORAGE_KEY)).toBe('{broken')
    expect(store.projects).toHaveLength(0)
  })
  it('reports unavailable storage instead of an empty success', async () => {
    vi.stubGlobal('localStorage', undefined)
    const store = useProjectsStore()
    store.loadProjects()
    expect(store.loaded).toBe(false)
    expect(store.loadError).toContain('无法访问')
    await expect(store.createProject(validInput)).rejects.toThrow('无法访问')
    expect(store.projects).toHaveLength(0)
  })
  it('uses the same ID when retrying an unconfirmed write', async () => {
    const store = useProjectsStore()
    storage.failNextReadAfterWrite = true
    await expect(store.createProject(validInput)).rejects.toThrow('无法确认')
    expect(store.projects).toHaveLength(0)
    storage.denyReads = false
    const savedBeforeRetry = readProjects(storage)
    expect(savedBeforeRetry).toHaveLength(1)
    const retried = await store.createProject(validInput)
    expect(retried.id).toBe(savedBeforeRetry[0]?.id)
    expect(readProjects(storage)).toHaveLength(1)
  })
  it('validates data even when bypassing the form', async () => {
    const store = useProjectsStore()
    await expect(store.createProject({ ...validInput, name: '' })).rejects.toThrow()
    expect(storage.data.size).toBe(0)
    expect(store.projects).toHaveLength(0)
  })
  it('shows the three newest projects', async () => {
    const store = useProjectsStore()
    for (const name of ['第一项', '第二项', '第三项', '第四项'])
      await store.createProject({ ...validInput, name })
    expect(store.recentProjects.map((project) => project.name)).toEqual([
      '第四项',
      '第三项',
      '第二项',
    ])
  })
})

describe('project form submission', () => {
  it('collects field errors and never saves an empty form', async () => {
    const form = useProjectForm()
    expect(await form.submit()).toBeNull()
    expect(form.errorSummary.value).toHaveLength(6)
    expect(storage.data.size).toBe(0)
    form.form.name = '项目名称'
    form.validateField('name')
    expect(form.errors.value.name).toBeUndefined()
  })
  it('preserves all user input when storage fails', async () => {
    const form = useProjectForm()
    Object.assign(form.form, validInput)
    storage.denyWrites = true
    expect(await form.submit()).toBeNull()
    expect(form.form).toEqual(validInput)
    expect(form.errors.value).toEqual({})
    expect(useProjectsStore().saveError).toContain('保存失败')
    expect(useProjectsStore().saving).toBe(false)
  })
  it('returns the confirmed record only after it is persisted', async () => {
    const form = useProjectForm()
    Object.assign(form.form, validInput)
    const result = await form.submit()
    expect(result?.id).toBeTruthy()
    expect(readProjects(storage)).toEqual([result])
  })
})
