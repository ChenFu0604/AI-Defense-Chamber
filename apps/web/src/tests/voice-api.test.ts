import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultVoiceSettings, MAX_VOICE_OUTPUT_BYTES, MAX_VOICE_UPLOAD_BYTES, MODEL_REQUEST_TIMEOUT_MS } from '@defense/shared'
import { getVoiceSettings, listVoiceCatalog, previewVoiceAudio, saveVoiceSettings, synthesizeVoice, transcribeVoice } from '../services/voice-api'

const config = {...defaultVoiceSettings, asr: {baseUrl: defaultVoiceSettings.asr.baseUrl, model: defaultVoiceSettings.asr.model, timeoutMs: 120000, hasApiKey: true}, tts: {provider: 'qwen', baseUrl: defaultVoiceSettings.tts.baseUrl, model: defaultVoiceSettings.tts.model, timeoutMs: 120000, hasApiKey: true}, source: 'saved', status: 'configured', updatedAt: null}
const catalog = {source: 'builtin', provider: 'qwen', model: defaultVoiceSettings.tts.model, docsUrl: 'https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list', notice: '官方文档内置目录', voices: [{id: 'voice-fixture', name: '测试声音', description: '测试用', languages: ['zh-CN']}]}
const audioResponse = () => new Response(new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 87, 65, 86, 69]), {headers: {'Content-Type': 'audio/wav'}})
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers()})
describe('voice APIs', () => {
  it('uses protected settings endpoints and validates safe config and built-in catalog', async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json({success: true, data: config})).mockResolvedValueOnce(Response.json({success: true, data: config})).mockResolvedValueOnce(Response.json({success: true, data: catalog})).mockResolvedValueOnce(audioResponse())
    vi.stubGlobal('fetch', transport)
    expect((await getVoiceSettings()).asr.hasApiKey).toBe(true)
    await saveVoiceSettings(defaultVoiceSettings)
    expect((await listVoiceCatalog(defaultVoiceSettings)).source).toBe('builtin')
    expect((await previewVoiceAudio({settings: defaultVoiceSettings, judgeId: 'business'})).type).toBe('audio/wav')
    expect(transport.mock.calls.map(call => call[0])).toEqual(['/api/v1/settings/voice', '/api/v1/settings/voice', '/api/v1/settings/voice/voices', '/api/v1/settings/voice/preview'])
    expect(transport.mock.calls[1]![1]).toMatchObject({method: 'PUT', headers: {'X-Settings-Request': '1'}})
    expect(JSON.parse(transport.mock.calls[3]![1].body)).toEqual({settings: defaultVoiceSettings, judgeId: 'business'})
  })
  it('sends raw audio and structured speech requests without frontend credentials', async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json({success: true, data: {text: '我的回答'}})).mockResolvedValueOnce(audioResponse())
    vi.stubGlobal('fetch', transport)
    const recording = new Blob(['test recording'], {type: 'audio/webm;codecs=opus'})
    expect(await transcribeVoice(recording)).toEqual({text: '我的回答'})
    await synthesizeVoice({judgeId: 'technical', text: '你准备怎么实现？'})
    expect(transport.mock.calls[0]![1]).toMatchObject({method: 'POST', body: recording, headers: {'X-Voice-Request': '1', 'Content-Type': 'audio/webm;codecs=opus'}})
    expect(transport.mock.calls[1]![1].headers).not.toHaveProperty('Authorization')
  })
  it('rejects leaked keys, mismatching catalogs, invalid transcription and input before fetch', async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json({success: true, data: {...config, asr: {...config.asr, apiKey: 'must-not-return'}}})).mockResolvedValueOnce(Response.json({success: true, data: {...catalog, model: 'other-model'}})).mockResolvedValueOnce(Response.json({success: true, data: {text: ''}}))
    vi.stubGlobal('fetch', transport)
    await expect(getVoiceSettings()).rejects.toThrow('格式异常')
    await expect(listVoiceCatalog(defaultVoiceSettings)).rejects.toThrow('不匹配')
    await expect(transcribeVoice(new Blob(['x'], {type: 'audio/webm'}))).rejects.toThrow('转写结果无效')
    await expect(synthesizeVoice({judgeId: 'user', text: ''})).rejects.toThrow()
    await expect(saveVoiceSettings({...defaultVoiceSettings, asr: {...defaultVoiceSettings.asr, timeoutMs: 0}})).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(3)
  })
  it('rejects empty, unsupported and oversized recordings locally', async () => {
    const transport = vi.fn(); vi.stubGlobal('fetch', transport)
    await expect(transcribeVoice(new Blob([], {type: 'audio/webm'}))).rejects.toThrow('为空')
    await expect(transcribeVoice(new Blob(['x'], {type: 'text/html'}))).rejects.toThrow('格式不受支持')
    await expect(transcribeVoice(new Blob([new Uint8Array(MAX_VOICE_UPLOAD_BYTES + 1)], {type: 'audio/webm'}))).rejects.toThrow('超过 10 MB')
    expect(transport).not.toHaveBeenCalled()
  })
  it('rejects non-audio, empty and oversized output rather than displaying success', async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json({success: true})).mockResolvedValueOnce(new Response('', {headers: {'Content-Type': 'audio/wav'}})).mockResolvedValueOnce(new Response('huge', {headers: {'Content-Type': 'audio/mpeg', 'Content-Length': String(MAX_VOICE_OUTPUT_BYTES + 1)}}))
    vi.stubGlobal('fetch', transport)
    const input = {judgeId: 'user' as const, text: '请举一个例子。'}
    await expect(synthesizeVoice(input)).rejects.toThrow('有效音频')
    await expect(synthesizeVoice(input)).rejects.toThrow('空音频')
    await expect(synthesizeVoice(input)).rejects.toThrow('音频过大')
  })
  it('preserves backend errors and reports offline and cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({success: false, error: {code: 'VOICE_NOT_CONFIGURED', message: '请先配置语音服务'}}, {status: 503})))
    await expect(synthesizeVoice({judgeId: 'devil', text: '问题'})).rejects.toThrow('请先配置语音服务')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(getVoiceSettings()).rejects.toThrow('无法连接语音后端')
    const controller = new AbortController(); controller.abort()
    await expect(getVoiceSettings(controller.signal)).rejects.toThrow('已取消')
  })
  it('times out without retaining a pending request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('abort'))))))
    const pending = expect(getVoiceSettings()).rejects.toThrow('语音请求超时')
    await vi.advanceTimersByTimeAsync(MODEL_REQUEST_TIMEOUT_MS + 1); await pending
  })
})
