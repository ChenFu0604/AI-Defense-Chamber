import { onMounted, onUnmounted } from 'vue'
import { useProjectsStore } from '../stores/projects'
import { useImprovementsStore } from '../stores/improvements'
import { useHistoryStore } from '../stores/history'

export function useProjectSync() {
  const projects = useProjectsStore()
  const tasks = useImprovementsStore()
  const history = useHistoryStore()
  const imported = () => { void projects.loadProjects(true); void tasks.load(true); void history.load(true) }
  const refresh = () => {
    void projects.loadProjects()
    void tasks.load()
  }
  const onVisibility = () => {if (document.visibilityState === 'visible') refresh()}
  onMounted(() => {
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('server-workspace-changed', imported)
    document.addEventListener('visibilitychange', onVisibility)
  })
  onUnmounted(() => {
    window.removeEventListener('focus', refresh)
    window.removeEventListener('server-workspace-changed', imported)
    document.removeEventListener('visibilitychange', onVisibility)
  })
}
