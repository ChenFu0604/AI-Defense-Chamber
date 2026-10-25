import { ref } from 'vue'
import type { JudgeId } from '@defense/shared'
import { synthesizeVoice } from '../services/voice-api'

export interface VoicePlayer {
  onended: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
  play(): Promise<void>
  pause(): void
  src: string
}
export interface VoicePlaybackDependencies {
  synthesize(input: { judgeId: JudgeId; text: string }, signal: AbortSignal): Promise<Blob>
  createPlayer(url: string): VoicePlayer
  createUrl(blob: Blob): string
  revokeUrl(url: string): void
}
export function createVoicePlaybackController(dependencies: VoicePlaybackDependencies) {
  const messageId = ref<string | null>(null), status = ref<'idle' | 'loading' | 'playing'>('idle')
  const error = ref(''), errorMessageId = ref<string | null>(null), recording = ref(false)
  let epoch = 0, request: AbortController | null = null, player: VoicePlayer | null = null, url: string | null = null
  function stop() {
    epoch++
    request?.abort(); request = null
    if (player) { player.onended = player.onerror = null; player.pause(); player.src = ''; player = null }
    if (url) dependencies.revokeUrl(url)
    url = null
    messageId.value = null
    status.value = 'idle'
  }
  function setRecording(value: boolean) { recording.value = value; if (value) stop() }
  async function play(id: string, judgeId: JudgeId, text: string) {
    if (recording.value) return
    if (messageId.value === id) { stop(); return }
    stop()
    const revision = epoch, abort = new AbortController()
    request = abort
    messageId.value = id
    status.value = 'loading'
    error.value = ''; errorMessageId.value = null
    try {
      const audio = await dependencies.synthesize({ judgeId, text }, abort.signal)
      if (revision !== epoch) return
      url = dependencies.createUrl(audio)
      const active = dependencies.createPlayer(url)
      player = active
      active.onended = () => { if (revision === epoch) stop() }
      active.onerror = () => {
        if (revision !== epoch) return
        stop(); errorMessageId.value = id; error.value = '音频播放失败，可以重试；答辩消息已保留。'
      }
      await active.play()
      if (revision === epoch) status.value = 'playing'
    } catch (failure) {
      if (revision !== epoch) return
      stop()
      errorMessageId.value = id
      error.value = failure instanceof Error ? failure.message : '评委朗读未完成，可以重试；答辩消息已保留。'
    }
  }
  return { messageId, status, error, errorMessageId, recording, play, stop, setRecording }
}

// Shared only for audio coordination; defense records and answers remain in the defense store.
export const voicePlayback = createVoicePlaybackController({
  synthesize: synthesizeVoice,
  createPlayer: url => new Audio(url),
  createUrl: blob => URL.createObjectURL(blob),
  revokeUrl: url => URL.revokeObjectURL(url),
})
