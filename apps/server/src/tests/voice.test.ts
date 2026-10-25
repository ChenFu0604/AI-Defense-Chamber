import { mkdtemp, readFile, readdir, unlink, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { defaultVoiceSettings, voiceSettingsResponseSchema, voiceCatalogResponseSchema, MAX_VOICE_OUTPUT_BYTES, MAX_VOICE_UPLOAD_BYTES, type VoiceSettingsInput } from '@defense/shared'
import { createApp } from '../app.js'
import { createVoiceService } from '../services/voice-service.js'
import { createVoiceClient } from '../services/voice-client.js'
import { getVoiceCatalog } from '../services/voice-catalog.js'

const directories: string[] = []
async function configPath() {
  const directory = await mkdtemp(join(tmpdir(), 'defense-voice-test-'))
  directories.push(directory)
  return join(directory, 'voice.json')
}
function config(): VoiceSettingsInput {
  return {
    ...structuredClone(defaultVoiceSettings), enabled: true,
    asr: { baseUrl: 'https://asr.fixture.invalid/v1', model: 'fixture-asr', apiKey: 'fixture-asr-secret', timeoutMs: 1000 },
    tts: { provider: 'openai_compatible', baseUrl: 'https://tts.fixture.invalid/v1', model: 'fixture-tts', apiKey: 'fixture-tts-secret', timeoutMs: 1000 },
    judges: { business: 'onyx', technical: 'echo', user: 'nova', devil: 'fable' },
  }
}
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(32)])
const wavResponse = () => new Response(wav, { headers: { 'Content-Type': 'audio/wav' } })
afterEach(async () => {
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    for (const file of await readdir(directory)) await unlink(join(directory, file))
    await rmdir(directory)
  }
})

describe('voice settings and routes', () => {
  it('returns disabled safe defaults and atomically persists independent keys without exposing them', async () => {
    const path = await configPath(), voice = createVoiceService({ path }), app = createApp({ voice })
    const initial = await request(app).get('/api/v1/settings/voice').set('X-Settings-Request', '1').expect(200)
    expect(voiceSettingsResponseSchema.parse(initial.body).data).toMatchObject({ enabled: false, source: 'default', asr: { hasApiKey: false }, tts: { hasApiKey: false } })
    const response = await request(app).put('/api/settings/voice').set('X-Settings-Request', '1').send(config()).expect(200)
    expect(response.body.data).toMatchObject({ status: 'configured', source: 'saved', asr: { hasApiKey: true }, tts: { hasApiKey: true } })
    expect(JSON.stringify(response.body)).not.toMatch(/fixture-asr-secret|fixture-tts-secret/)
    expect(await readFile(path, 'utf8')).toContain('fixture-asr-secret')
    expect(createVoiceService({ path }).get()).toEqual(response.body.data)
    expect(await readdir(directories.at(-1)!)).toEqual(['voice.json'])
  })
  it('retains blank keys only for unchanged endpoints and does not forward them to a new endpoint', async () => {
    const voice = createVoiceService({ path: await configPath() }), value = config()
    await voice.save(value)
    value.asr.apiKey = ''; value.tts.apiKey = ''
    expect(await voice.save(value)).toMatchObject({ asr: { hasApiKey: true }, tts: { hasApiKey: true } })
    value.asr.baseUrl = 'https://different.fixture.invalid/v1'
    await expect(voice.save(value)).rejects.toMatchObject({ code: 'VOICE_API_KEY_REQUIRED' })
    value.enabled = false
    expect(await voice.save(value)).toMatchObject({ enabled: false, asr: { hasApiKey: false }, tts: { hasApiKey: true } })
  })
  it('allows disabled configuration without keys but refuses enabled configuration missing either service key', async () => {
    const voice = createVoiceService({ path: await configPath() })
    expect(await voice.save(structuredClone(defaultVoiceSettings))).toMatchObject({ enabled: false })
    const value = config(); value.asr.apiKey = ''
    await expect(voice.save(value)).rejects.toMatchObject({ code: 'VOICE_API_KEY_REQUIRED' })
  })
  it('preserves corrupt configuration and reports an explicit failure', async () => {
    const path = await configPath(); await writeFile(path, 'broken JSON')
    const voice = createVoiceService({ path })
    expect(() => voice.get()).toThrow('损坏')
    await expect(voice.save(config())).rejects.toMatchObject({ code: 'VOICE_SETTINGS_CORRUPT' })
    expect(await readFile(path, 'utf8')).toBe('broken JSON')
  })
  it('protects settings and paid runtime operations by header, host and origin', async () => {
    const app = createApp({ voice: createVoiceService({ path: await configPath() }) })
    await request(app).get('/api/settings/voice').expect(403)
    await request(app).get('/api/settings/voice').set('X-Settings-Request', '1').set('Origin', 'https://attacker.invalid').expect(403)
    await request(app).get('/api/settings/voice').set('X-Settings-Request', '1').set('Host', 'attacker.invalid').expect(403)
    await request(app).post('/api/voice/speech').send({ judgeId: 'user', text: '问题' }).expect(403)
  })
  it('returns a clearly labelled builtin catalog without making network requests', async () => {
    const transport = vi.fn<typeof fetch>(), app = createApp({ voice: createVoiceService({ path: await configPath(), transport }) })
    const response = await request(app).post('/api/settings/voice/voices').set('X-Settings-Request', '1').send(defaultVoiceSettings).expect(200)
    const data = voiceCatalogResponseSchema.parse(response.body).data
    expect(data.source).toBe('builtin'); expect(data.notice).toContain('并非实时')
    expect(data.voices.map(item => item.id)).toContain('xunanchuan_v3.1')
    expect(transport).not.toHaveBeenCalled()
    expect(() => getVoiceCatalog({ provider: 'qwen', model: 'unknown' })).toThrow('未收录')
  })
  it('previews real audio using unsaved TTS settings and never overwrites saved settings', async () => {
    const path = await configPath(), transport = vi.fn<typeof fetch>().mockResolvedValue(wavResponse())
    const voice = createVoiceService({ path, transport }), app = createApp({ voice })
    const input = config(); input.enabled = false; input.asr.apiKey = ''
    await request(app).post('/api/settings/voice/preview').set('X-Settings-Request', '1').send({ settings: input, judgeId: 'technical' }).expect(200).expect('Content-Type', /audio\/wav/)
    const [url, options] = transport.mock.calls[0]!
    expect(url).toBe('https://tts.fixture.invalid/v1/audio/speech')
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer fixture-tts-secret' })
    expect(JSON.parse(options!.body as string)).toMatchObject({ voice: 'echo', response_format: 'wav' })
    expect(voice.get().source).toBe('default')
  })
  it('accepts raw recorded audio and returns normalized transcription without provider metadata', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ text: '这是我的回答', usage: { seconds: 3 }, language: 'zh' }))
    const voice = createVoiceService({ path: await configPath(), transport }); await voice.save(config())
    const app = createApp({ voice })
    const result = await request(app).post('/api/v1/voice/transcriptions').set('X-Voice-Request', '1').set('Content-Type', 'audio/wav').send(wav).expect(200)
    expect(result.body).toEqual({ success: true, data: { text: '这是我的回答' } })
    const [url, options] = transport.mock.calls[0]!
    expect(url).toBe('https://asr.fixture.invalid/v1/audio/transcriptions')
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer fixture-asr-secret' })
    expect((options!.body as FormData).get('file')).toBeInstanceOf(Blob)
  })
  it('rejects wrong raw audio content, empty text, malformed voice IDs and disabled runtime', async () => {
    const app = createApp({ voice: createVoiceService({ path: await configPath() }) })
    await request(app).post('/api/voice/transcriptions').set('X-Voice-Request', '1').set('Content-Type', 'audio/wav').send('not audio').expect(400)
    await request(app).post('/api/voice/speech').set('X-Voice-Request', '1').send({ judgeId: 'user', text: ' ' }).expect(400)
    await request(app).post('/api/voice/speech').set('X-Voice-Request', '1').send({ judgeId: 'invalid', text: '问题' }).expect(400)
    const response = await request(app).post('/api/voice/speech').set('X-Voice-Request', '1').send({ judgeId: 'user', text: '问题' }).expect(503)
    expect(response.body.error.code).toBe('VOICE_DISABLED')
  })
  it('rejects oversized upload before contacting a provider', async () => {
    const transport = vi.fn<typeof fetch>(), app = createApp({ voice: createVoiceService({ path: await configPath(), transport }) })
    await request(app).post('/api/voice/transcriptions').set('X-Voice-Request', '1').set('Content-Type', 'audio/wav').send(Buffer.alloc(MAX_VOICE_UPLOAD_BYTES + 1)).expect(413)
    expect(transport).not.toHaveBeenCalled()
  })
})

describe('voice provider validation and transport', () => {
  it('rejects HTML and fake audio and never returns provider error contents or credentials', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<html>bad</html>', { headers: { 'Content-Type': 'audio/wav' } })).mockResolvedValueOnce(new Response('fixture-tts-secret', { status: 401 }))
    const client = createVoiceClient(transport)
    await expect(client.speak(config().tts, 'echo', '问题')).rejects.toMatchObject({ code: 'VOICE_AUDIO_INVALID' })
    await expect(client.speak(config().tts, 'echo', '问题')).rejects.toMatchObject({ code: 'VOICE_AUTH_FAILED', message: expect.not.stringContaining('fixture-tts-secret') })
  })
  it('handles failed requests and malformed or empty transcription', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('fixture-asr-secret')).mockResolvedValueOnce(Response.json({ text: '' })).mockResolvedValueOnce(new Response('bad-json'))
    const client = createVoiceClient(transport)
    await expect(client.transcribe(config().asr, wav, 'audio/wav')).rejects.toMatchObject({ code: 'VOICE_CONNECTION_FAILED', message: expect.not.stringContaining('fixture-asr-secret') })
    await expect(client.transcribe(config().asr, wav, 'audio/wav')).rejects.toMatchObject({ code: 'VOICE_TRANSCRIPTION_INVALID' })
    await expect(client.transcribe(config().asr, wav, 'audio/wav')).rejects.toMatchObject({ code: 'VOICE_RESPONSE_INVALID' })
  })
  it('enforces timeouts and explicit cancellation even for a nonresponsive provider', async () => {
    vi.useFakeTimers()
    const client = createVoiceClient(vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {})))
    const pending = client.speak(config().tts, 'echo', '问题')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'VOICE_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(1001); await assertion
    const controller = new AbortController(), cancelled = client.speak(config().tts, 'echo', '问题', controller.signal)
    const cancelledAssertion = expect(cancelled).rejects.toMatchObject({ code: 'VOICE_CANCELLED' })
    controller.abort(); await cancelledAssertion
  })
  it('does not call an upstream for an already cancelled request and rejects oversized audio response', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(wav, { headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(MAX_VOICE_OUTPUT_BYTES + 1) } }))
    const client = createVoiceClient(transport), controller = new AbortController(); controller.abort()
    await expect(client.speak(config().tts, 'echo', '问题', controller.signal)).rejects.toMatchObject({ code: 'VOICE_CANCELLED' })
    expect(transport).not.toHaveBeenCalled()
    await expect(client.speak(config().tts, 'echo', '问题')).rejects.toMatchObject({ code: 'VOICE_RESPONSE_TOO_LARGE' })
  })
  it('uses the official Qwen HTTP payload, validates download and does not forward authorization', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ output: { finish_reason: 'stop', audio: { url: 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/generated.wav?token=fixture' } } })).mockResolvedValueOnce(wavResponse())
    const tts = { ...defaultVoiceSettings.tts, baseUrl: 'https://fixture.cn-beijing.maas.aliyuncs.com/api/v1', apiKey: 'fixture-qwen-key', timeoutMs: 1000 }
    const result = await createVoiceClient(transport).speak(tts, 'xunanchuan_v3.1', '问题')
    expect(result.contentType).toBe('audio/wav')
    expect(transport.mock.calls[0]![0]).toBe('https://fixture.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer')
    expect(JSON.parse(transport.mock.calls[0]![1]!.body as string)).toEqual({ model: tts.model, input: { text: '问题', voice: 'xunanchuan_v3.1', format: 'wav', sample_rate: 24000 } })
    expect(String(transport.mock.calls[1]![0])).toMatch(/^https:\/\//)
    expect(transport.mock.calls[1]![1]).not.toHaveProperty('headers')
    expect(transport.mock.calls[1]![1]?.redirect).toBe('error')
  })
  it.each(['https://127.0.0.1/private.wav', 'https://attacker.invalid/private.wav', 'https://user:secret@dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.wav'])('blocks untrusted Qwen download URL %s', async url => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ output: { finish_reason: 'stop', audio: { url } } }))
    const tts = { ...defaultVoiceSettings.tts, baseUrl: 'https://fixture.cn-beijing.maas.aliyuncs.com/api/v1', apiKey: 'fixture' }
    await expect(createVoiceClient(transport).speak(tts, 'xunanchuan_v3.1', '问题')).rejects.toMatchObject({ code: 'VOICE_AUDIO_URL_INVALID' })
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('rejects Qwen voice/model mismatch and invalid endpoint before a paid call', async () => {
    const transport = vi.fn<typeof fetch>(), client = createVoiceClient(transport)
    await expect(client.speak(defaultVoiceSettings.tts, 'Cherry', '问题')).rejects.toMatchObject({ code: 'VOICE_MODEL_MISMATCH' })
    await expect(client.speak(defaultVoiceSettings.tts, 'xunanchuan_v3.1', '问题')).rejects.toMatchObject({ code: 'VOICE_QWEN_ENDPOINT_INVALID' })
    expect(transport).not.toHaveBeenCalled()
  })
})
