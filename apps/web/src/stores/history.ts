import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { ServerHistory } from '@defense/shared'
import { loadHistorySources, syncHistoricalSession } from '../services/history-service'
export const useHistoryStore = defineStore('history', () => {
  const archive = shallowRef<ServerHistory>({ version: 1, projects: [], analyses: [], entries: [] })
  const legacy = ref<Awaited<ReturnType<typeof loadHistorySources>>['legacy']>([])
  const error = ref(''), warning = ref(''), message = ref(''), busy = ref(false), loading = ref(false), loaded = ref(false)
  const entries = computed(() => [...archive.value.entries].sort((a, b) => Date.parse(b.session.createdAt) - Date.parse(a.session.createdAt)))
  let revision = 0
  let request: { token: number; promise: Promise<boolean> } | null = null
  function load(force: unknown = false): Promise<boolean> {
    if (force === true) { revision++; request = null }
    if (request) return request.promise
    const token = revision
    loading.value = true; error.value = ''; warning.value = ''
    const promise = (async () => {
      try {
        const result = await loadHistorySources()
        if (token !== revision) return false
        archive.value = result.archive; legacy.value = result.legacy
        warning.value = result.warnings.join(' '); loaded.value = true
        return true
      } catch (failure) {
        if (token === revision) error.value = failure instanceof Error ? failure.message : '服务端历史读取失败。'
        return false
      } finally { if (revision === token) { loading.value = false; request = null } }
    })()
    request = {token, promise}
    return promise
  }
  async function sync(id: string) {
    if (busy.value) return
    busy.value = true; message.value = ''; error.value = ''
    try { const notice = await syncHistoricalSession(id); if (await load()) message.value = notice }
    catch (failure) { error.value = failure instanceof Error ? failure.message : '历史读取失败。' }
    finally { busy.value = false }
  }
  return { archive, legacy, entries, error, warning, message, busy, loading, loaded, load, sync }
})
