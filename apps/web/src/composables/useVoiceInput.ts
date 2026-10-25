import { computed, onMounted, onScopeDispose, ref, shallowRef } from 'vue'
import { MAX_VOICE_RECORDING_SECONDS, MAX_VOICE_UPLOAD_BYTES } from '@defense/shared'
import { transcribeVoice } from '../services/voice-api'

export type VoiceInputState = 'idle' | 'requesting' | 'recording' | 'stopping' | 'ready' | 'transcribing' | 'review' | 'error'
export interface VoiceStream { getTracks(): { stop(): void }[] }
export interface VoiceRecorder {
  state: string
  mimeType: string
  ondataavailable: ((event: { data: Blob }) => void) | null
  onstop: (() => void) | null
  onerror: (() => void) | null
  start(timeslice?: number): void
  stop(): void
}
export interface VoiceInputDependencies {
  requestStream(): Promise<VoiceStream>
  createRecorder(stream: VoiceStream): VoiceRecorder
  transcribe(audio: Blob, signal: AbortSignal): Promise<{ text: string }>
}

function captureError(failure: unknown): string {
  if (failure instanceof Error) {
    if (failure.name === 'NotAllowedError') return '麦克风权限未开启。请在浏览器地址栏允许使用麦克风，或继续文字作答。'
    if (failure.name === 'NotFoundError') return '没有找到可用的麦克风，请检查设备连接，或继续文字作答。'
    if (failure.name === 'NotReadableError') return '麦克风暂时无法使用，可能被其他程序占用。请关闭占用后重试。'
    return failure.message
  }
  return '语音处理未完成，请重试或使用文字作答。'
}

/** A cancellable, session-scoped capture flow. It never sends a defense answer itself. */
export function createVoiceInputController(dependencies: VoiceInputDependencies) {
  const state = ref<VoiceInputState>('idle'), error = ref(''), transcript = ref(''), seconds = ref(0)
  const audio = shallowRef<Blob | null>(null)
  const busy = computed(() => ['requesting', 'recording', 'stopping', 'transcribing'].includes(state.value))
  let epoch = 0, stream: VoiceStream | null = null, recorder: VoiceRecorder | null = null
  let timer: ReturnType<typeof setInterval> | undefined, permissionTimer: ReturnType<typeof setTimeout> | undefined, abort: AbortController | null = null
  function release() {
    clearInterval(timer)
    clearTimeout(permissionTimer)
    timer = undefined
    stream?.getTracks().forEach(track => track.stop())
    stream = null
  }
  function cancel() {
    epoch++
    abort?.abort()
    abort = null
    const active = recorder
    recorder = null
    if (active) {
      active.ondataavailable = active.onstop = active.onerror = null
      if (active.state !== 'inactive') { try { active.stop() } catch { /* Already stopped by the device. */ } }
    }
    release()
    audio.value = null
    transcript.value = ''
    seconds.value = 0
    error.value = ''
    state.value = 'idle'
  }
  async function start() {
    if (busy.value) return
    cancel()
    const revision = epoch
    state.value = 'requesting'
    permissionTimer = setTimeout(() => {
      if (revision !== epoch || state.value !== 'requesting') return
      cancel()
      error.value = '等待麦克风授权超时。请允许麦克风权限后重试，或继续文字作答。'
      state.value = 'error'
    }, 30000)
    try {
      const acquired = await dependencies.requestStream()
      if (revision !== epoch) { acquired.getTracks().forEach(track => track.stop()); return }
      clearTimeout(permissionTimer)
      stream = acquired
      const active = dependencies.createRecorder(acquired), chunks: Blob[] = []
      let byteLength = 0
      recorder = active
      active.ondataavailable = event => {
        if (revision !== epoch || !event.data.size) return
        chunks.push(event.data)
        byteLength += event.data.size
        if (byteLength > MAX_VOICE_UPLOAD_BYTES) stop()
      }
      active.onerror = () => {
        if (revision !== epoch) return
        cancel()
        error.value = '录音中断，请检查麦克风后重新录制；原有文字草稿没有变化。'
        state.value = 'error'
      }
      active.onstop = () => {
        if (revision !== epoch) return
        release()
        recorder = null
        const result = new Blob(chunks, { type: active.mimeType || chunks[0]?.type || 'audio/webm' })
        if (!result.size || result.size > MAX_VOICE_UPLOAD_BYTES) {
          error.value = !result.size ? '没有录到音频，请检查麦克风后重录。' : '录音超过 10 MB，请缩短内容后重录。'
          state.value = 'error'
          return
        }
        audio.value = result
        state.value = 'ready'
      }
      // Deliver bounded chunks while capturing rather than buffering the entire
      // recording in the browser until stop. The final blob is checked again.
      active.start(1000)
      state.value = 'recording'
      const startedAt = Date.now()
      timer = setInterval(() => {
        seconds.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
        if (seconds.value >= MAX_VOICE_RECORDING_SECONDS) stop()
      }, 1000)
    } catch (failure) {
      if (revision !== epoch) return
      release()
      recorder = null
      error.value = captureError(failure)
      state.value = 'error'
    }
  }
  function stop() {
    if (state.value !== 'recording' || !recorder) return
    state.value = 'stopping'
    try { recorder.stop(); release() } catch (failure) { release(); error.value = captureError(failure); state.value = 'error' }
  }
  async function transcribe() {
    if (!audio.value || busy.value) return
    const revision = epoch, request = new AbortController()
    abort = request
    error.value = ''
    state.value = 'transcribing'
    try {
      const result = await dependencies.transcribe(audio.value, request.signal)
      if (revision !== epoch) return
      if (!result.text.trim()) throw new Error('没有识别到文字，可以重试识别或重新录音。')
      transcript.value = result.text.trim()
      state.value = 'review'
    } catch (failure) {
      if (revision !== epoch) return
      error.value = captureError(failure)
      state.value = 'ready'
    } finally { if (revision === epoch) abort = null }
  }
  return { state, error, transcript, seconds, audio, busy, start, stop, transcribe, cancel }
}

export function useVoiceInput() {
  const control = createVoiceInputController({
    requestStream: () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
        throw new Error('当前浏览器不支持录音。请使用支持录音的浏览器，在 HTTPS 或 localhost 下访问，也可以继续文字作答。')
      return navigator.mediaDevices.getUserMedia({ audio: true })
    },
    createRecorder: stream => {
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      return new MediaRecorder(stream as MediaStream, mimeType ? { mimeType } : undefined) as unknown as VoiceRecorder
    },
    transcribe: transcribeVoice,
  })
  // Stop capture when the page is hidden; background timers can be throttled.
  // The audio stays in the panel for review when the user returns.
  const stopWhenHidden = () => { if (document.hidden) control.stop() }
  onMounted(() => document.addEventListener('visibilitychange', stopWhenHidden))
  onScopeDispose(() => {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', stopWhenHidden)
    control.cancel()
  })
  return control
}

export function appendVoiceTranscript(draft: string, transcript: string): string {
  const text = transcript.trim()
  if (!text) throw new Error('识别内容为空，请先输入或重新识别。')
  const next = draft.trim() ? `${draft}\n${text}` : text
  if (next.length > 4000) throw new Error('合并后超过 4000 字，请先精简识别内容或原有草稿；当前草稿未改动。')
  return next
}
