import { computed, nextTick, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createProjectRecord,
  projectInputSchema,
  projectSchema,
  type Project,
  type ProjectInput,
  type ProjectWorkspace,
} from '@defense/shared'
import { readProjectWorkspace, writeProjectWorkspace } from '../services/project-storage'
import { archiveProject } from '../services/history-storage'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const loaded = ref(false)
  const loadError = ref('')
  const saveError = ref('')
  const saving = ref(false)
  const historyWarning = ref('')
  const revisions = ref<ProjectWorkspace['revisions']>([])
  const archivedIds = ref<string[]>([])
  const activeProjects = computed(() => projects.value.filter((p) => !archivedIds.value.includes(p.id)))
  const recentProjects = computed(() => activeProjects.value.slice(0, 3))
  let pendingProject: Project | null = null
  let pendingInput = ''

  function apply(workspace: ProjectWorkspace) {
    projects.value = workspace.projects
    revisions.value = workspace.revisions
    archivedIds.value = workspace.archivedIds
    loaded.value = true
    loadError.value = ''
  }
  function archiveSnapshot(project: Project) {
    try {
      archiveProject(project)
      historyWarning.value = ''
    } catch (failure) {
      historyWarning.value = failure instanceof Error ? failure.message : '历史归档失败，项目主记录已保存。'
    }
  }

  function loadProjects() {
    try {
      apply(readProjectWorkspace())
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : '读取项目失败，请重试。'
    }
  }

  async function createProject(input: ProjectInput): Promise<Project> {
    if (saving.value) throw new Error('项目正在保存，请勿重复提交。')
    saving.value = true
    saveError.value = ''
    try {
      await nextTick()
      const parsed = projectInputSchema.parse(input)
      const fingerprint = JSON.stringify(parsed)
      if (!pendingProject || fingerprint !== pendingInput) {
        pendingProject = createProjectRecord(parsed, crypto.randomUUID(), new Date().toISOString())
        pendingInput = fingerprint
      }
      const project = pendingProject
      // Re-read before writing; keep the same ID when retrying an unconfirmed write.
      const latest = readProjectWorkspace()
      latest.projects = [project, ...latest.projects.filter((saved) => saved.id !== project.id)]
      writeProjectWorkspace(latest)
      apply(latest)
      archiveSnapshot(project)
      pendingProject = null
      return project
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : '保存项目失败，填写内容已保留。'
      throw error
    } finally {
      saving.value = false
    }
  }

  function findProject(id: string) {
    return projects.value.find((project) => project.id === id)
  }
  async function updateProject(base: Project, input: ProjectInput): Promise<Project> {
    if (saving.value) throw new Error('项目正在保存，请勿重复提交。')
    saving.value = true
    saveError.value = ''
    try {
      await nextTick()
      const parsed = projectInputSchema.parse(input)
      const latest = readProjectWorkspace()
      const current = latest.projects.find((p) => p.id === base.id)
      if (!current) throw new Error('原项目不存在，未覆盖资料。请返回我的项目检查。')
      // An unconfirmed write can be retried without creating another revision.
      if (JSON.stringify(projectInputSchema.parse(current)) === JSON.stringify(parsed)) {
        apply(latest)
        return current
      }
      if (JSON.stringify(current) !== JSON.stringify(base))
        throw new Error('项目已在其他页面更新。当前输入保留，请另开项目详情核对后再编辑，避免覆盖新版本。')
      const project = projectSchema.parse({
        ...parsed, id: current.id, createdAt: current.createdAt,
        updatedAt: new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString(),
      })
      let entry = latest.revisions.find((v) => v.projectId === current.id)
      if (!entry) {
        entry = { projectId: current.id, snapshots: [] }
        latest.revisions.push(entry)
      }
      entry.snapshots.push(current)
      latest.projects = latest.projects.map((p) => p.id === project.id ? project : p)
      writeProjectWorkspace(latest)
      apply(latest)
      archiveSnapshot(project)
      return project
    } catch (failure) {
      saveError.value = failure instanceof Error ? failure.message : '更新失败，输入已保留。'
      throw failure
    } finally {
      saving.value = false
    }
  }
  function setArchived(id: string, archived: boolean) {
    try {
      const workspace = readProjectWorkspace()
      if (!workspace.projects.some((p) => p.id === id)) throw new Error('项目不存在。')
      workspace.archivedIds = workspace.archivedIds.filter((key) => key !== id)
      if (archived) workspace.archivedIds.push(id)
      writeProjectWorkspace(workspace)
      apply(workspace)
      saveError.value = ''
    } catch (failure) {
      saveError.value = failure instanceof Error ? failure.message : '归档状态保存失败。'
    }
  }
  return {
    projects,
    recentProjects,
    activeProjects,
    revisions,
    archivedIds,
    loaded,
    loadError,
    saveError,
    saving,
    historyWarning,
    loadProjects,
    createProject,
    updateProject,
    setArchived,
    findProject,
  }
})
