import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { projectInputSchema, projectRecordResponseSchema, projectWorkspaceResponseSchema,
  type Project, type ProjectInput, type ProjectWorkspace } from '@defense/shared'
import { serverRequest } from '../services/server-api'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([]), revisions = ref<ProjectWorkspace['revisions']>([]), archivedIds = ref<string[]>([])
  const loaded = ref(false), loading = ref(false), saving = ref(false)
  const loadError = ref(''), saveError = ref(''), historyWarning = ref('')
  const activeProjects = computed(() => projects.value.filter(p => !archivedIds.value.includes(p.id)))
  const recentProjects = computed(() => activeProjects.value.slice(0, 3))
  let generation = 0
  let reading: { token: number; promise: Promise<boolean> } | null = null
  let pendingCreate: { requestId: string; fingerprint: string } | null = null
  function apply(workspace: ProjectWorkspace) {
    projects.value = workspace.projects; revisions.value = workspace.revisions; archivedIds.value = workspace.archivedIds
    loaded.value = true; loadError.value = ''
  }
  function loadProjects(force: unknown = false): Promise<boolean> {
    if (force === true) invalidateRead()
    if (reading?.token === generation) return reading.promise
    const token = generation
    loading.value = true
    const promise = (async () => {
      try {
        const workspace = await serverRequest('/projects', projectWorkspaceResponseSchema)
        if (token !== generation) return false
        apply(workspace)
        return true
      } catch (failure) {
        if (token === generation) {
          loadError.value = failure instanceof Error ? failure.message : '读取服务端项目失败，请重试。'
        }
        return false
      } finally {
        if (reading?.token === token) { reading = null; loading.value = false }
      }
    })()
    reading = {token, promise}
    return promise
  }
  function beginSave() {
    if (saving.value) throw new Error('项目正在保存，请勿重复提交。')
    saving.value = true; saveError.value = ''; invalidateRead()
  }
  function invalidateRead() {
    generation++; reading = null; loading.value = false
  }
  function applyRecord(project: Project, base?: Project) {
    invalidateRead()
    projects.value = [project, ...projects.value.filter(p => p.id !== project.id)]
    if (base && project.updatedAt !== base.updatedAt) {
      let entry = revisions.value.find(item => item.projectId === project.id)
      if (!entry) { entry = {projectId: project.id, snapshots: []}; revisions.value.push(entry) }
      if (!entry.snapshots.some(saved => saved.updatedAt === base.updatedAt)) entry.snapshots.push(base)
    }
    loadError.value = ''; historyWarning.value = ''
  }
  async function createProject(input: ProjectInput): Promise<Project> {
    beginSave()
    try {
      const parsed = projectInputSchema.parse(input), fingerprint = JSON.stringify(parsed)
      if (!pendingCreate || pendingCreate.fingerprint !== fingerprint)
        pendingCreate = {requestId: crypto.randomUUID(), fingerprint}
      const project = await serverRequest('/projects', projectRecordResponseSchema, {
        method: 'POST', body: {requestId: pendingCreate.requestId, input: parsed},
      })
      applyRecord(project); pendingCreate = null
      await loadProjects()
      return project
    } catch (failure) {
      saveError.value = failure instanceof Error ? failure.message : '服务端保存项目失败，填写内容已保留。'
      throw failure
    } finally { saving.value = false }
  }
  function findProject(id: string) { return projects.value.find(project => project.id === id) }
  async function updateProject(base: Project, input: ProjectInput): Promise<Project> {
    beginSave()
    try {
      const project = await serverRequest('/projects/' + base.id, projectRecordResponseSchema, {
        method: 'PUT', body: {expectedUpdatedAt: base.updatedAt, input: projectInputSchema.parse(input)},
      })
      applyRecord(project, base)
      await loadProjects()
      return project
    } catch (failure) {
      saveError.value = failure instanceof Error ? failure.message : '服务端更新项目失败，输入已保留。'
      throw failure
    } finally { saving.value = false }
  }
  async function setArchived(id: string, archived: boolean) {
    if (saving.value) return false
    beginSave()
    try {
      const workspace = await serverRequest('/projects/' + id + '/archive', projectWorkspaceResponseSchema, {
        method: 'PATCH', body: {archived},
      })
      invalidateRead(); apply(workspace)
      return true
    } catch (failure) {
      saveError.value = failure instanceof Error ? failure.message : '归档状态保存失败，请重试。'
      return false
    } finally { saving.value = false }
  }
  return {projects, revisions, archivedIds, activeProjects, recentProjects, loaded, loading, saving,
    loadError, saveError, historyWarning, loadProjects, createProject, updateProject, setArchived, findProject}
})
