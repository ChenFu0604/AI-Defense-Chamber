import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultVoiceSettings, type PublicVoiceSettings, type VoiceCatalog } from '@defense/shared'
import { useVoiceSettings } from '../composables/useVoiceSettings'
import { getVoiceSettings, listVoiceCatalog, previewVoiceAudio, saveVoiceSettings } from '../services/voice-api'

vi.mock('../services/voice-api', () => ({getVoiceSettings: vi.fn(), listVoiceCatalog: vi.fn(), previewVoiceAudio: vi.fn(), saveVoiceSettings: vi.fn()}))
const initial: PublicVoiceSettings = {enabled: true,
  asr: {baseUrl: defaultVoiceSettings.asr.baseUrl, model: defaultVoiceSettings.asr.model, timeoutMs: 120000, hasApiKey: true},
  tts: {provider: 'qwen', baseUrl: defaultVoiceSettings.tts.baseUrl, model: defaultVoiceSettings.tts.model, timeoutMs: 120000, hasApiKey: true},
  judges: {...defaultVoiceSettings.judges}, source: 'saved', status: 'configured', updatedAt: '2026-10-24T02:00:00.000Z'}
const catalog: VoiceCatalog = {source: 'builtin', provider: 'qwen', model: defaultVoiceSettings.tts.model, docsUrl: 'https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list', notice: '内置目录', voices: [{id: 'fixture-voice', name: '测试', description: '测试声音', languages: ['zh-CN']}]}
const scopes: ReturnType<typeof effectScope>[] = []
function setup() { const scope = effectScope(); scopes.push(scope); return {scope, ui: scope.run(useVoiceSettings)!} }
class FakeAudio {
  static instances: FakeAudio[] = []
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn(); load = vi.fn(); removeAttribute = vi.fn()
  constructor(readonly src: string) { FakeAudio.instances.push(this) }
}
beforeEach(() => {
  vi.mocked(getVoiceSettings).mockReset().mockResolvedValue(structuredClone(initial))
  vi.mocked(saveVoiceSettings).mockReset().mockResolvedValue(structuredClone(initial))
  vi.mocked(listVoiceCatalog).mockReset().mockResolvedValue(structuredClone(catalog))
  vi.mocked(previewVoiceAudio).mockReset().mockResolvedValue(new Blob(['test'], {type: 'audio/wav'}))
  vi.stubGlobal('Audio', FakeAudio); FakeAudio.instances = []
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture-preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => {scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); vi.restoreAllMocks()})
describe('voice settings state', () => {
  it('loads safe values and saves independently without storing browser keys', async () => {
    const persist = vi.fn(); vi.stubGlobal('localStorage', {setItem: persist})
    const {ui} = setup(); await ui.run('loading')
    expect(ui.form.asr.apiKey).toBe(''); expect(ui.form.tts.apiKey).toBe('')
    ui.form.asr.apiKey = 'fixture-asr-key'; ui.form.tts.apiKey = 'fixture-tts-key'
    await ui.run('saving')
    expect(saveVoiceSettings).toHaveBeenCalledWith(expect.objectContaining({asr: expect.objectContaining({apiKey: 'fixture-asr-key'}), tts: expect.objectContaining({apiKey: 'fixture-tts-key'})}), expect.any(AbortSignal))
    expect(ui.form.asr.apiKey).toBe(''); expect(ui.message.value).toContain('保存不代表连接已测试')
    expect(persist).not.toHaveBeenCalled(); expect(previewVoiceAudio).not.toHaveBeenCalled()
  })
  it('requires independent credentials when enabled but permits disabled setup', async () => {
    vi.mocked(getVoiceSettings).mockResolvedValueOnce({...structuredClone(initial), enabled: false, asr: {...initial.asr, hasApiKey: false}, tts: {...initial.tts, hasApiKey: false}})
    const {ui} = setup(); await ui.run('loading'); await ui.run('saving')
    expect(saveVoiceSettings).toHaveBeenCalledTimes(1)
    ui.form.enabled = true
    // The save response above carries saved credentials; reload a genuinely empty setup.
    vi.mocked(getVoiceSettings).mockResolvedValueOnce({...structuredClone(initial), asr: {...initial.asr, hasApiKey: false}, tts: {...initial.tts, hasApiKey: false}})
    await ui.run('loading'); await ui.run('saving')
    expect(ui.errors.value['asr.apiKey']).toBeTruthy(); expect(ui.errors.value['tts.apiKey']).toBeTruthy()
    expect(saveVoiceSettings).toHaveBeenCalledTimes(1)
  })
  it('loads a labeled built-in catalog without contacting the TTS service or saving', async () => {
    const {ui} = setup(); await ui.run('loading'); await ui.run('catalog')
    expect(ui.catalog.value).toEqual(catalog)
    expect(ui.message.value).toContain('未连接供应商查询')
    expect(previewVoiceAudio).not.toHaveBeenCalled(); expect(saveVoiceSettings).not.toHaveBeenCalled()
    ui.form.tts.model = 'new-model'
    expect(ui.catalog.value).toBeNull(); expect(ui.message.value).toBe('')
  })
  it('clears destination credentials, catalog and voice defaults when provider changes', async () => {
    const {ui} = setup(); await ui.run('loading'); await ui.run('catalog')
    ui.form.tts.apiKey = 'do-not-forward'; ui.form.tts.provider = 'openai_compatible'
    expect(ui.catalog.value).toBeNull(); expect(ui.form.tts.apiKey).toBe('')
    expect(ui.form.tts.baseUrl).toBe('https://api.openai.com/v1'); expect(ui.form.tts.model).toBe('')
    expect(ui.form.judges.business).toBe('alloy')
    ui.form.tts.model = 'supported-speech-model'; await ui.run('saving')
    expect(ui.errors.value['tts.apiKey']).toContain('更换服务')
    expect(saveVoiceSettings).not.toHaveBeenCalled()
  })
  it('requires Qwen assignments supported by the loaded model and previews only the selected role', async () => {
    const {ui} = setup(); await ui.run('loading'); await ui.run('catalog'); await ui.run('saving')
    expect(ui.errors.value['judges.technical']).toContain('不支持当前模型')
    expect(saveVoiceSettings).not.toHaveBeenCalled()
    ui.form.judges.business = 'fixture-voice'; await ui.run('preview')
    expect(previewVoiceAudio).toHaveBeenCalledTimes(1)
    expect(ui.playing.value).toBe(true)
  })
  it('allows disabling voice after a model or endpoint change without forcing new credentials or matching voices', async () => {
    const {ui} = setup(); await ui.run('loading'); await ui.run('catalog')
    ui.form.enabled = false
    ui.form.asr.baseUrl = 'https://changed.fixture.invalid/v1'
    ui.form.tts.baseUrl = 'https://changed.cn-beijing.maas.aliyuncs.com/api/v1'
    // The loaded catalog excludes the prior role assignments. Disabled settings
    // must still be savable; the backend drops old keys for changed destinations.
    await ui.run('saving')
    expect(saveVoiceSettings).toHaveBeenCalledWith(expect.objectContaining({enabled: false,
      asr: expect.objectContaining({baseUrl: 'https://changed.fixture.invalid/v1', apiKey: ''}),
      tts: expect.objectContaining({baseUrl: 'https://changed.cn-beijing.maas.aliyuncs.com/api/v1', apiKey: ''}),
    }), expect.any(AbortSignal))
    expect(ui.errors.value).toEqual({})
  })
  it('previews unsaved voice selection and stops/releases audio on selection changes', async () => {
    const {ui} = setup(); await ui.run('loading')
    ui.form.judges.technical = 'fixture-voice'; ui.selectedJudge.value = 'technical'; await ui.run('preview')
    expect(previewVoiceAudio).toHaveBeenCalledWith(expect.objectContaining({judgeId: 'technical', settings: expect.objectContaining({judges: expect.objectContaining({technical: 'fixture-voice'})})}), expect.any(AbortSignal))
    expect(ui.playing.value).toBe(true); expect(ui.message.value).toContain('未验证语音识别 ASR')
    const player = FakeAudio.instances[0]!
    ui.selectedJudge.value = 'user'
    expect(player.pause).toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture-preview')
    expect(ui.playing.value).toBe(false)
  })
  it('preserves input after save failure and does not show a false success', async () => {
    const {ui} = setup(); await ui.run('loading'); ui.form.tts.apiKey = 'keep-input'
    vi.mocked(saveVoiceSettings).mockRejectedValueOnce(new Error('磁盘写入失败'))
    await ui.run('saving')
    expect(ui.error.value).toBe('磁盘写入失败'); expect(ui.message.value).toBe(''); expect(ui.form.tts.apiKey).toBe('keep-input')
  })
  it('prevents duplicate preview and ignores a canceled late audio response', async () => {
    const {ui} = setup(); await ui.run('loading')
    let resolve!: (blob: Blob) => void
    vi.mocked(previewVoiceAudio).mockImplementationOnce(() => new Promise(done => {resolve = done}))
    const pending = ui.run('preview'); await ui.run('preview'); await ui.run('saving')
    expect(previewVoiceAudio).toHaveBeenCalledTimes(1); expect(saveVoiceSettings).not.toHaveBeenCalled()
    const signal = vi.mocked(previewVoiceAudio).mock.calls[0]![1]!
    ui.stopPreview(); resolve(new Blob(['late'], {type: 'audio/wav'})); await pending
    expect(signal.aborted).toBe(true); expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(ui.busy.value).toBe(false)
  })
  it('aborts on disposal and clears both in-memory keys', async () => {
    const {ui, scope} = setup(); await ui.run('loading')
    ui.form.asr.apiKey = 'asr-secret'; ui.form.tts.apiKey = 'tts-secret'
    let resolve!: (value: VoiceCatalog) => void
    vi.mocked(listVoiceCatalog).mockImplementationOnce(() => new Promise(done => {resolve = done}))
    const pending = ui.run('catalog'), signal = vi.mocked(listVoiceCatalog).mock.calls[0]![1]!
    scope.stop(); resolve(catalog); await pending
    expect(signal.aborted).toBe(true); expect(ui.form.asr.apiKey).toBe(''); expect(ui.form.tts.apiKey).toBe(''); expect(ui.catalog.value).toBeNull()
  })
})
