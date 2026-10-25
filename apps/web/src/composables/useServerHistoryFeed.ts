import { onMounted, onScopeDispose, ref, shallowRef } from 'vue'
import type { ServerHistory } from '@defense/shared'
import { loadHistorySources } from '../services/history-service'

export function createServerHistoryFeed(load = loadHistorySources) {
  const archive = shallowRef<ServerHistory | null>(null), loading = ref(false), error = ref('')
  let controller: AbortController | null = null, epoch = 0, removeListener: (() => void) | null = null, disposed = false
  async function refresh() {
    if (disposed) return
    controller?.abort()
    const active = new AbortController(), token = ++epoch
    controller = active; loading.value = true; error.value = ''
    try {
      const result = await load(active.signal)
      if (token === epoch && !active.signal.aborted) archive.value = result.archive
    } catch (failure) {
      if (token === epoch && !active.signal.aborted) error.value = failure instanceof Error ? failure.message : '服务端训练记录读取失败。'
    } finally {
      if (token === epoch) { loading.value = false; controller = null }
    }
  }
  function listen(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>) {
    removeListener?.()
    const changed = () => { void refresh() }
    target.addEventListener('server-workspace-changed', changed)
    removeListener = () => target.removeEventListener('server-workspace-changed', changed)
  }
  function dispose() {
    disposed = true
    epoch++; controller?.abort(); controller = null; loading.value = false
    removeListener?.(); removeListener = null
  }
  return { archive, loading, error, refresh, listen, dispose }
}

export function useServerHistoryFeed() {
  const feed = createServerHistoryFeed()
  onMounted(() => { feed.listen(window); void feed.refresh() })
  onScopeDispose(feed.dispose)
  return feed
}
