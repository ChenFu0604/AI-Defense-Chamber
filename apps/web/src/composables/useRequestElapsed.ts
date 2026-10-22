import { onScopeDispose, ref, watch, type Ref } from 'vue'

/** Time observed on this page, never a fabricated completion percentage or ETA. */
export function useRequestElapsed(active: Ref<boolean>, requestKey?: Ref<unknown>) {
  const seconds = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined
  watch(() => [active.value, requestKey?.value], () => {
    clearInterval(timer)
    seconds.value = 0
    if (!active.value) return
    const started = Date.now()
    timer = setInterval(() => { seconds.value = Math.floor((Date.now() - started) / 1000) }, 1000)
  }, {immediate: true})
  onScopeDispose(() => clearInterval(timer))
  return seconds
}
