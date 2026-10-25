import { ref } from 'vue'
import { defineStore } from 'pinia'
import { taskListResponseSchema, improvementUpdateSchema, type DefenseReport, type ImprovementTask, type ImprovementUpdate } from '@defense/shared'
import { serverRequest } from '../services/server-api'
import { loadServerTasks } from '../services/improvement-api'

export const useImprovementsStore = defineStore('improvements', () => {
  const tasks = ref<ImprovementTask[]>([]), error = ref(''), busy = ref(false), loading = ref(false), loaded = ref(false)
  let revision = 0, refreshAfterMutation = false
  let reading: { token: number; promise: Promise<boolean> } | null = null
  function load(force: unknown = false): Promise<boolean> {
    if (busy.value) {
      if (force === true) refreshAfterMutation = true
      return Promise.resolve(false)
    }
    if (force === true) { revision++; reading = null }
    if (reading) return reading.promise
    const token = revision
    loading.value = true; error.value = ''
    const promise = (async () => {
      try { const records = await loadServerTasks(); if (token !== revision) return false; tasks.value = records; loaded.value = true; return true }
      catch (failure) { if (token === revision) error.value = failure instanceof Error ? failure.message : '任务读取失败。'; return false }
      finally { if (revision === token) { loading.value = false; reading = null } }
    })()
    reading = {token, promise}
    return promise
  }
  async function mutate(action: () => Promise<ImprovementTask[]>) {
    if (busy.value) return false
    busy.value = true; error.value = ''; revision++; reading = null; loading.value = false
    try { tasks.value = await action(); revision++; loaded.value = true; return true }
    catch (failure) { error.value = failure instanceof Error ? failure.message : '任务保存失败，输入已保留。'; return false }
    finally {
      busy.value = false
      if (refreshAfterMutation) { refreshAfterMutation = false; void load(true) }
    }
  }
  function add(report: DefenseReport, index: number, _projectName?: string) {
    return mutate(() => serverRequest('/improvements', taskListResponseSchema, { method: 'POST', body: { sourceSessionId: report.sessionId, improvementIndex: index } }))
  }
  function update(base: ImprovementTask, patch: ImprovementUpdate) {
    return mutate(() => serverRequest('/improvements/' + encodeURIComponent(base.id), taskListResponseSchema,
      { method: 'PUT', body: { expectedUpdatedAt: base.updatedAt, update: improvementUpdateSchema.parse(patch) } }))
  }
  return { tasks, error, busy, loading, loaded, load, add, update }
})
