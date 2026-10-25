import { taskListResponseSchema } from '@defense/shared'
import { serverRequest } from './server-api'
import { downloadJsonSnapshot } from './history-service'
export const loadServerTasks = () => serverRequest('/improvements', taskListResponseSchema)
export async function downloadImprovementBackup() {
  const tasks = await loadServerTasks()
  downloadJsonSnapshot({ version: 1, tasks }, 'defense-improvement-tasks.json')
  return tasks
}
