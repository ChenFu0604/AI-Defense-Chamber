import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultVoiceSettings, type PublicVoiceSettings } from '@defense/shared'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createVoiceReadinessController, VOICE_READINESS_TIMEOUT_MS } from '../composables/useVoiceReadiness'
import VoiceAnswerPanel from '../components/defense/VoiceAnswerPanel.vue'

const configured: PublicVoiceSettings = {
  enabled: true,
  asr: { baseUrl: defaultVoiceSettings.asr.baseUrl, model: defaultVoiceSettings.asr.model, timeoutMs: 120000, hasApiKey: true },
  tts: { provider: defaultVoiceSettings.tts.provider, baseUrl: defaultVoiceSettings.tts.baseUrl, model: defaultVoiceSettings.tts.model, timeoutMs: 120000, hasApiKey: true },
  judges: { ...defaultVoiceSettings.judges }, source: 'saved', status: 'configured', updatedAt: null,
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
afterEach(() => vi.useRealTimers())

describe('local voice configuration readiness', () => {
  it('renders initial recording disabled while checking and explains when recognition is actually verified', async () => {
    const html = await renderToString(createSSRApp(VoiceAnswerPanel, { draft: '已有草稿', contextKey: 'session:question', disabled: false }))
    expect(html).toContain('正在检查本机保存的语音配置')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^]*?开始录音/)
    expect(html).toContain('不会自动发送回答')
    expect(html).not.toContain('语音连接已通过')
  })
  it('blocks recording until a local configuration read finishes and only reads once while pending', async () => {
    const pending = deferred<PublicVoiceSettings>(), read = vi.fn(() => pending.promise)
    const control = createVoiceReadinessController(read)
    expect(control.ready.value).toBe(false)
    const load = control.load(); await control.load()
    expect(control.state.value).toBe('loading'); expect(control.ready.value).toBe(false)
    expect(read).toHaveBeenCalledOnce()
    pending.resolve(configured); await load
    expect(control.ready.value).toBe(true); expect(control.error.value).toBe('')
    control.dispose()
  })
  it('explains disabled configuration before any recording can start', async () => {
    const control = createVoiceReadinessController(async () => ({ ...configured, enabled: false, status: 'not_configured' }))
    await control.load()
    expect(control.ready.value).toBe(false); expect(control.state.value).toBe('not_configured')
    expect(control.error.value).toContain('尚未启用')
    control.dispose()
  })
  it.each(['asr', 'tts'] as const)('requires saved %s credentials despite an inconsistent configured status', async kind => {
    const settings = { ...configured, [kind]: { ...configured[kind], hasApiKey: false } }
    const control = createVoiceReadinessController(async () => settings)
    await control.load()
    expect(control.ready.value).toBe(false); expect(control.error.value).toContain('尚不完整')
    control.dispose()
  })
  it('preserves backend error context and supports an explicit retry', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('语音配置文件损坏，已保留原文件')).mockResolvedValueOnce(configured)
    const control = createVoiceReadinessController(read)
    await control.load()
    expect(control.ready.value).toBe(false); expect(control.state.value).toBe('error')
    expect(control.error.value).toContain('损坏')
    await control.load()
    expect(control.ready.value).toBe(true); expect(control.error.value).toBe('')
    control.dispose()
  })
  it('enforces an independent eight-second deadline even when a read ignores cancellation', async () => {
    vi.useFakeTimers()
    const pending = deferred<PublicVoiceSettings>(), read = vi.fn((_signal: AbortSignal) => pending.promise)
    const control = createVoiceReadinessController(read)
    const load = control.load()
    await vi.advanceTimersByTimeAsync(VOICE_READINESS_TIMEOUT_MS)
    await load
    expect(read.mock.calls[0]![0].aborted).toBe(true)
    expect(control.state.value).toBe('error'); expect(control.error.value).toContain('超时')
    pending.resolve(configured); await Promise.resolve()
    expect(control.ready.value).toBe(false)
    control.dispose()
  })
  it('aborts on disposal and discards late configuration without allowing recording', async () => {
    const pending = deferred<PublicVoiceSettings>(), read = vi.fn((_signal: AbortSignal) => pending.promise)
    const control = createVoiceReadinessController(read)
    const load = control.load(); control.dispose()
    expect(read.mock.calls[0]![0].aborted).toBe(true)
    await load
    pending.resolve(configured); await Promise.resolve()
    expect(control.ready.value).toBe(false)
    await control.load(); expect(read).toHaveBeenCalledOnce()
  })
})
