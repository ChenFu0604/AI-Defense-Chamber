import { computed, nextTick, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createProjectRecord,
  projectInputSchema,
  type Project,
  type ProjectInput,
} from '@defense/shared'
import { readProjects, writeProjects } from '../services/project-storage'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const loaded = ref(false)
  const loadError = ref('')
  const saveError = ref('')
  const saving = ref(false)
  const recentProjects = computed(() => projects.value.slice(0, 3))
  let pendingProject: Project | null = null
  let pendingInput = ''

  function loadProjects() {
    try {
      const saved = readProjects()
      projects.value = saved
      loaded.value = true
      loadError.value = ''
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
      const latest = readProjects()
      const updated = [project, ...latest.filter((saved) => saved.id !== project.id)]
      writeProjects(updated)
      projects.value = updated
      loaded.value = true
      loadError.value = ''
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
  return {
    projects,
    recentProjects,
    loaded,
    loadError,
    saveError,
    saving,
    loadProjects,
    createProject,
    findProject,
  }
})
