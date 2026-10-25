import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createVoiceInputController, appendVoiceTranscript, type VoiceRecorder, type VoiceInputDependencies } from '../composables/useVoiceInput'
import { createVoicePlaybackController, type VoicePlayer, type VoicePlaybackDependencies } from '../composables/useVoicePlayback'
import VoiceAnswerPanel from '../components/defense/VoiceAnswerPanel.vue'
import JudgeVoiceButton from '../components/defense/JudgeVoiceButton.vue'
import { endedReportSession } from '../../../../tests/fixtures/report'
import { MAX_VOICE_UPLOAD_BYTES } from '@defense/shared'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function captureFixture(transcriber: VoiceInputDependencies['transcribe'] = async () => ({ text: '我们准备先访谈十位用户。' })) {
  const transcribe = vi.fn(transcriber)
  const track = { stop: vi.fn() }, stream = { getTracks: () => [track] }
  const recorder: VoiceRecorder = {
    state: 'inactive', mimeType: 'audio/webm', ondataavailable: null, onstop: null, onerror: null,
    start() { this.state = 'recording' },
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['recorded voice'], { type: this.mimeType }) }); this.onstop?.() },
  }
  const requestStream = vi.fn(async () => stream)
  return { track, stream, recorder, transcribe, requestStream,
    control: createVoiceInputController({ requestStream, createRecorder: () => recorder, transcribe }) }
}
afterEach(() => vi.useRealTimers())

describe('voice answer capture and explicit confirmation', () => {
  it('releases microphone when stopped, transcribes only on request and leaves confirmed text to the caller', async () => {
    const { control, track, transcribe } = captureFixture()
    try {
      await control.start()
      expect(control.state.value).toBe('recording')
      expect(transcribe).not.toHaveBeenCalled()
      control.stop()
      expect(track.stop).toHaveBeenCalledOnce()
      expect(control.audio.value?.size).toBeGreaterThan(0)
      expect(control.state.value).toBe('ready')
      await control.transcribe()
      expect(control.state.value).toBe('review')
      expect(control.transcript.value).toContain('访谈十位用户')
      expect(appendVoiceTranscript('原有回答', control.transcript.value)).toBe('原有回答\n我们准备先访谈十位用户。')
    } finally { control.cancel() }
  })
  it('keeps recorded audio and draft after ASR failure, allowing a retry', async () => {
    const transcribe = vi.fn().mockRejectedValueOnce(new Error('语音请求超时')).mockResolvedValueOnce({ text: '重试成功的文字' })
    const { control } = captureFixture(transcribe)
    try {
      await control.start(); control.stop()
      const audio = control.audio.value
      await control.transcribe()
      expect(control.state.value).toBe('ready')
      expect(control.error.value).toBe('语音请求超时')
      expect(control.audio.value).toBe(audio)
      await control.transcribe()
      expect(control.transcript.value).toBe('重试成功的文字')
      expect(control.error.value).toBe('')
    } finally { control.cancel() }
  })
  it('guards repeated stop clicks while the recorder is asynchronously finishing', async () => {
    const { control, recorder, track } = captureFixture()
    recorder.stop = vi.fn(() => { recorder.state = 'inactive' })
    try {
      await control.start(); control.stop(); control.stop()
      expect(recorder.stop).toHaveBeenCalledOnce()
      expect(control.state.value).toBe('stopping')
      expect(control.busy.value).toBe(true)
      expect(track.stop).toHaveBeenCalledOnce()
      recorder.ondataavailable?.({ data: new Blob(['audio']) }); recorder.onstop?.()
      expect(control.state.value).toBe('ready')
    } finally { control.cancel() }
  })
  it('aborts old transcriptions and rejects late results after a question change or cancel', async () => {
    const pending = deferred<{ text: string }>()
    const transcribe = vi.fn((_blob: Blob, _signal: AbortSignal) => pending.promise)
    const { control } = captureFixture(transcribe)
    await control.start(); control.stop()
    const request = control.transcribe()
    control.cancel()
    expect(transcribe.mock.calls[0]![1].aborted).toBe(true)
    pending.resolve({ text: '旧问题的迟到识别结果' }); await request
    expect(control.state.value).toBe('idle')
    expect(control.transcript.value).toBe('')
    expect(control.audio.value).toBeNull()
  })
  it('releases tracks even if permission resolves after cancellation', async () => {
    const stream = { getTracks: () => [{ stop: stopTrack }] }, stopTrack = vi.fn()
    const pending = deferred<typeof stream>()
    const control = createVoiceInputController({ requestStream: () => pending.promise, createRecorder: vi.fn(), transcribe: vi.fn() })
    const start = control.start(); control.cancel(); pending.resolve(stream); await start
    expect(stopTrack).toHaveBeenCalledOnce()
    expect(control.state.value).toBe('idle')
  })
  it('does not request the microphone twice when start is triggered repeatedly', async () => {
    const { control, requestStream } = captureFixture()
    try {
      const first = control.start(), second = control.start()
      await Promise.all([first, second])
      expect(requestStream).toHaveBeenCalledOnce()
      expect(control.state.value).toBe('recording')
    } finally { control.cancel() }
  })
  it('shows microphone denial without touching a text draft', async () => {
    const failure = new Error('denied'); failure.name = 'NotAllowedError'
    const control = createVoiceInputController({ requestStream: vi.fn().mockRejectedValue(failure), createRecorder: vi.fn(), transcribe: vi.fn() })
    try { await control.start(); expect(control.error.value).toContain('麦克风权限未开启'); expect(control.busy.value).toBe(false) }
    finally { control.cancel() }
  })
  it('cancels a stalled permission request after 30 seconds and releases later-acquired tracks', async () => {
    vi.useFakeTimers()
    const pending = deferred<{ getTracks(): { stop(): void }[] }>(), stopTrack = vi.fn()
    const control = createVoiceInputController({ requestStream: () => pending.promise, createRecorder: vi.fn(), transcribe: vi.fn() })
    const start = control.start()
    await vi.advanceTimersByTimeAsync(30000)
    expect(control.error.value).toContain('授权超时')
    pending.resolve({ getTracks: () => [{ stop: stopTrack }] }); await start
    expect(stopTrack).toHaveBeenCalledOnce()
    control.cancel()
  })
  it('stops recording at the shared two-minute limit and releases hardware', async () => {
    vi.useFakeTimers()
    const { control, track } = captureFixture()
    try {
      await control.start(); await vi.advanceTimersByTimeAsync(120000)
      expect(control.seconds.value).toBe(120)
      expect(control.state.value).toBe('ready')
      expect(track.stop).toHaveBeenCalledOnce()
    } finally { control.cancel() }
  })
  it('uses elapsed time rather than interval counts after a delayed timer', async () => {
    vi.useFakeTimers()
    const { control, track } = captureFixture()
    try {
      const startedAt = Date.now()
      await control.start()
      // Simulate a delayed callback after the tab or event loop was paused.
      vi.setSystemTime(startedAt + 120000)
      await vi.advanceTimersByTimeAsync(1000)
      expect(control.seconds.value).toBeGreaterThanOrEqual(120)
      expect(control.state.value).toBe('ready')
      expect(track.stop).toHaveBeenCalledOnce()
    } finally { control.cancel() }
  })
  it('stops oversized chunked recordings before transcription and releases the microphone', async () => {
    const { control, recorder, track, transcribe } = captureFixture()
    const start = vi.spyOn(recorder, 'start')
    try {
      await control.start()
      expect(start).toHaveBeenCalledWith(1000)
      recorder.ondataavailable?.({ data: new Blob([new Uint8Array(MAX_VOICE_UPLOAD_BYTES + 1)]) })
      expect(control.state.value).toBe('error')
      expect(control.error.value).toContain('超过 10 MB')
      expect(control.audio.value).toBeNull()
      expect(track.stop).toHaveBeenCalledOnce()
      await control.transcribe()
      expect(transcribe).not.toHaveBeenCalled()
    } finally { control.cancel() }
  })
  it('rejects empty recognition and keeps the same audio available for retry', async () => {
    const { control } = captureFixture(vi.fn(async () => ({ text: '  ' })))
    try { await control.start(); control.stop(); await control.transcribe(); expect(control.error.value).toContain('没有识别到文字'); expect(control.audio.value).not.toBeNull() }
    finally { control.cancel() }
  })
  it('never silently overwrites or truncates the existing draft', () => {
    const existing = 'A'.repeat(3999)
    expect(() => appendVoiceTranscript(existing, '识别文字')).toThrow('超过 4000 字')
    expect(existing).toHaveLength(3999)
    expect(appendVoiceTranscript('', '语音回答')).toBe('语音回答')
    expect(() => appendVoiceTranscript('已有草稿', ' ')).toThrow('为空')
  })
  it('describes manual confirmation, cancellation and the configured external voice service', async () => {
    const html = await renderToString(createSSRApp(VoiceAnswerPanel, { draft: '已有草稿', contextKey: 'session:question', disabled: false }))
    expect(html).toContain('不会自动发送回答')
    expect(html).toContain('配置的语音服务')
    expect(html).toContain('开始录音')
    expect(html).toContain('取消')
  })
})

function playbackFixture(synthesizer: VoicePlaybackDependencies['synthesize'] = async () => new Blob(['voice'], { type: 'audio/wav' })) {
  const synthesize = vi.fn(synthesizer)
  const player: VoicePlayer = { src: 'blob:voice', onended: null, onerror: null, play: vi.fn(async () => {}), pause: vi.fn() }
  const createPlayer = vi.fn(() => player), revokeUrl = vi.fn()
  return { synthesize, player, createPlayer, revokeUrl, control: createVoicePlaybackController({ synthesize, createPlayer, createUrl: () => 'blob:voice', revokeUrl }) }
}
describe('judge speech playback', () => {
  it('speaks the saved question exactly and releases the object URL when playback ends', async () => {
    const { control, synthesize, player, revokeUrl } = playbackFixture()
    await control.play('question', 'technical', '你准备怎样保护用户数据？')
    expect(synthesize.mock.calls[0]?.[0]).toEqual({ judgeId: 'technical', text: '你准备怎样保护用户数据？' })
    expect(control.status.value).toBe('playing')
    player.onended?.(new Event('ended'))
    expect(control.status.value).toBe('idle')
    expect(player.pause).toHaveBeenCalledOnce()
    expect(revokeUrl).toHaveBeenCalledWith('blob:voice')
  })
  it('stops speech before microphone capture and blocks new playback while recording', async () => {
    const { control, synthesize, player } = playbackFixture()
    await control.play('q1', 'business', '谁会付费？')
    control.setRecording(true)
    expect(player.pause).toHaveBeenCalledOnce()
    await control.play('q2', 'user', '怎样使用？')
    expect(synthesize).toHaveBeenCalledOnce()
    control.setRecording(false)
    await control.play('q2', 'user', '怎样使用？')
    expect(synthesize).toHaveBeenCalledTimes(2)
    control.stop()
  })
  it('cancels queued synthesis and ignores late audio after navigating away', async () => {
    const pending = deferred<Blob>(), synthesize = vi.fn((_input: unknown, _signal: AbortSignal) => pending.promise)
    const { control, createPlayer } = playbackFixture(synthesize)
    const play = control.play('q1', 'business', '谁会付费？'); control.stop()
    expect(synthesize.mock.calls[0]![1].aborted).toBe(true)
    pending.resolve(new Blob(['late audio'])); await play
    expect(createPlayer).not.toHaveBeenCalled()
    expect(control.status.value).toBe('idle')
  })
  it('keeps speech failures separate from answer submission and permits retry', async () => {
    const synthesize = vi.fn().mockRejectedValueOnce(new Error('请先配置语音服务')).mockResolvedValueOnce(new Blob(['audio']))
    const { control } = playbackFixture(synthesize)
    await control.play('q1', 'business', '谁会付费？')
    expect(control.errorMessageId.value).toBe('q1')
    expect(control.error.value).toBe('请先配置语音服务')
    expect(control.status.value).toBe('idle')
    await control.play('q1', 'business', '谁会付费？')
    expect(control.status.value).toBe('playing')
    expect(control.error.value).toBe('')
    control.stop()
  })
  it('renders a named manual speech control for a saved judge message', async () => {
    const message = endedReportSession().messages[0]!
    const html = await renderToString(createSSRApp(JudgeVoiceButton, { message }))
    expect(html).toContain('aria-label="朗读评委问题"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).not.toContain('autoplay')
  })
})
