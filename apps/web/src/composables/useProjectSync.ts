import { onMounted, onUnmounted } from 'vue'
import { useProjectsStore } from '../stores/projects'
import { PROJECT_STORAGE_KEY } from '../services/project-storage'

export function useProjectSync() {
  const projects = useProjectsStore()
  const onStorage = (event: StorageEvent) => {
    if (event.key === PROJECT_STORAGE_KEY || event.key === null) projects.loadProjects()
  }
  onMounted(() => {
    projects.loadProjects()
    window.addEventListener('storage', onStorage)
  })
  onUnmounted(() => window.removeEventListener('storage', onStorage))
}
