import { computed, onScopeDispose, ref } from 'vue'
import type { PublicVoiceSettings } from '@defense/shared'
import { getVoiceSettings } from '../services/voice-api'

export const VOICE_READINESS_TIMEOUT_MS = 8000
type ReadinessState = 'idle' | 'loading' | 'ready' | 'not_configured' | 'error'

/** Only checks locally saved settings; it never records or calls a voice provider. */
export function createVoiceReadinessController(read: (signal: AbortSignal) => Promise<PublicVoiceSettings>) {
  const state = ref<ReadinessState>('idle'), error = ref('')
  const ready = computed(() => state.value === 'ready')
  let disposed = false, revision = 0, request: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  async function load() {
    if (disposed || state.value === 'loading') return
    const current = ++revision, controller = new AbortController()
    request = controller
    state.value = 'loading'; error.value = ''
    let cancelRead: (() => void) | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      cancelRead = () => reject(new Error('语音配置检查已取消。'))
      controller.signal.addEventListener('abort', cancelRead, { once: true })
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('读取语音配置超时，请检查后端连接后重试；可以继续文字作答。'))
      }, VOICE_READINESS_TIMEOUT_MS)
    })
    try {
      const settings = await Promise.race([read(controller.signal), deadline])
      if (disposed || current !== revision) return
      if (!settings.enabled || settings.status !== 'configured' || !settings.asr.hasApiKey || !settings.tts.hasApiKey) {
        state.value = 'not_configured'
        error.value = !settings.enabled
          ? '语音功能尚未启用。请先在系统设置中配置并保存语音服务，再开始录音。'
          : '语音服务配置尚不完整。请先在系统设置中补齐识别与播报配置，再开始录音。'
      } else state.value = 'ready'
    } catch (failure) {
      if (disposed || current !== revision) return
      state.value = 'error'
      // The audio API may reject immediately on abort, before the timeout promise
      // settles. Keep the configuration deadline explicit in either ordering.
      error.value = controller.signal.aborted
        ? '读取语音配置超时，请检查后端连接后重试；可以继续文字作答。'
        : failure instanceof Error ? failure.message : '读取语音配置失败，请重试或继续文字作答。'
    } finally {
      if (cancelRead) controller.signal.removeEventListener('abort', cancelRead)
      if (current === revision) { clearTimeout(timer); timer = undefined; request = null }
    }
  }
  function dispose() {
    disposed = true; revision++; request?.abort(); request = null
    clearTimeout(timer); timer = undefined
    state.value = 'idle'; error.value = ''
  }
  return { state, ready, error, load, dispose }
}

export function useVoiceReadiness() {
  const control = createVoiceReadinessController(getVoiceSettings)
  onScopeDispose(control.dispose)
  return control
}
