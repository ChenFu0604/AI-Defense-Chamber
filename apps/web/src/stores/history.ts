import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { HistoryArchive } from '@defense/shared'
import {
  loadHistorySources,
  syncHistoricalSession,
  archiveLegacyProjects,
} from '../services/history-service'
export const useHistoryStore = defineStore('history', () => {
  const archive = shallowRef<HistoryArchive>({
    version: 1,
    projects: [],
    analyses: [],
    entries: [],
  })
  const legacy = ref<ReturnType<typeof loadHistorySources>['legacy']>([])
  const error = ref(''),
    warning = ref(''),
    message = ref(''),
    busy = ref(false)
  const entries = computed(() =>
    [...archive.value.entries].sort(
      (a, b) => Date.parse(b.session.createdAt) - Date.parse(a.session.createdAt),
    ),
  )
  function load() {
    error.value = ''
    warning.value = ''
    try {
      const result = loadHistorySources()
      archive.value = result.archive
      legacy.value = result.legacy
      warning.value = result.warnings.join(' ')
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '历史读取失败。'
    }
  }
  async function sync(id: string) {
    if (busy.value) return
    busy.value = true
    message.value = ''
    error.value = ''
    try {
      message.value = await syncHistoricalSession(id)
      load()
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '历史同步失败。'
    } finally {
      busy.value = false
    }
  }
  function archiveProjects() {
    try {
      archiveLegacyProjects()
      load()
      message.value = '已有项目与画像已补存到历史归档。'
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : '归档失败。'
    }
  }
  return { archive, legacy, entries, error, warning, message, busy, load, sync, archiveProjects }
})
