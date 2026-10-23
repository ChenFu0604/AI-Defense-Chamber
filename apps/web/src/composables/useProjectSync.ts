import { onMounted, onUnmounted } from 'vue'
import { useProjectsStore } from '../stores/projects'
import { PROJECT_STORAGE_KEY } from '../services/project-storage'
import { IMPROVEMENT_STORAGE_KEY } from '../services/improvement-storage'
import { useImprovementsStore } from '../stores/improvements'

export function useProjectSync() {
  const projects = useProjectsStore()
  const tasks = useImprovementsStore()
  const onStorage = (event: StorageEvent) => {
    if (event.key === PROJECT_STORAGE_KEY || event.key === null) projects.loadProjects()
    if (event.key === IMPROVEMENT_STORAGE_KEY || event.key === null) tasks.load()
  }
  onMounted(() => {
    projects.loadProjects()
    tasks.load()
    window.addEventListener('storage', onStorage)
  })
  onUnmounted(() => window.removeEventListener('storage', onStorage))
}
