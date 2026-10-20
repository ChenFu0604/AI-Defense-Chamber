import { createServer, type Server } from 'node:http'
import { mkdtemp, readdir, readFile, unlink, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  modelSettingsInputSchema,
  modelSettingsResponseSchema,
  modelConnectionResponseSchema,
} from '@defense/shared'
import { createApp } from '../app.js'
import { readAIConfig } from '../config/ai.js'
import { createModelSettingsService } from '../services/model-settings-service.js'

const input = {
  baseUrl: 'https://fixture.invalid/v1',
  model: 'fixture-model',
  apiKey: 'fixture-secret-key',
  timeoutMs: 1000,
  responseFormat: 'json_schema' as const,
}
const completion = (value: unknown = { ok: true }) =>
  Response.json({
    model: 'fixture-model',
    choices: [{ message: { content: JSON.stringify(value) }, finish_reason: 'stop' }],
  })
const directories: string[] = [],
  servers: Server[] = []
async function path() {
  const directory = await mkdtemp(join(tmpdir(), 'model-settings-test-'))
  directories.push(directory)
  return join(directory, 'model-config.json')
}
afterEach(async () => {
  vi.useRealTimers()
  for (const server of servers.splice(0))
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  for (const directory of directories.splice(0)) {
    for (const file of await readdir(directory)) await unlink(join(directory, file))
    await rmdir(directory)
  }
})
describe('persisted model settings', () => {
  it('handles malformed URL input and redacts credentials from invalid environment URLs', async () => {
    expect(modelSettingsInputSchema.safeParse({ ...input, baseUrl: 'not-a-url' }).success).toBe(
      false,
    )
    const service = createModelSettingsService({
      path: await path(),
      source: {
        OPENAI_BASE_URL: 'https://user:private-password@fixture.invalid/v1?key=private-token',
        OPENAI_API_KEY: 'private-key',
        OPENAI_MODEL: 'fixture',
      },
    })
    const value = service.get()
    expect(value.status).toBe('configuration_error')
    expect(value.baseUrl).toBe('https://fixture.invalid/v1')
    expect(JSON.stringify(value)).not.toMatch(/private-password|private-token|private-key/)
  })
  it('returns safe defaults, saves atomically, restores after restart and updates the runtime loader', async () => {
    const file = await path(),
      service = createModelSettingsService({ path: file, source: {} })
    expect(service.get()).toMatchObject({
      source: 'default',
      hasApiKey: false,
      status: 'not_configured',
    })
    const saved = await service.save(input)
    expect(saved).toMatchObject({
      source: 'saved',
      hasApiKey: true,
      status: 'configured',
      model: input.model,
    })
    expect(JSON.stringify(saved)).not.toContain(input.apiKey)
    const restarted = createModelSettingsService({ path: file, source: { OPENAI_MODEL: 'other' } })
    expect(restarted.get()).toEqual(saved)
    expect(readAIConfig(undefined, file)).toMatchObject({
      apiKey: input.apiKey,
      model: input.model,
      baseUrl: input.baseUrl,
    })
    expect(await readdir(directories[0]!)).toEqual(['model-config.json'])
  })
  it('preserves keys on blank input and never forwards them to a changed URL', async () => {
    const file = await path(),
      transport = vi.fn<typeof fetch>().mockResolvedValue(completion())
    const service = createModelSettingsService({ path: file, source: {}, transport })
    await service.save(input)
    await service.save({ ...input, apiKey: '', model: 'new-model' })
    expect(readAIConfig(undefined, file).apiKey).toBe(input.apiKey)
    await expect(
      service.test({ ...input, apiKey: '', baseUrl: 'https://another.invalid/v1' }),
    ).rejects.toMatchObject({ code: 'API_KEY_REQUIRED' })
    expect(transport).not.toHaveBeenCalled()
    await expect(
      service.save({ ...input, apiKey: '', baseUrl: 'https://another.invalid/v1' }),
    ).rejects.toMatchObject({ code: 'API_KEY_REQUIRED' })
    expect(service.get().baseUrl).toBe(input.baseUrl)
  })
  it('imports environment settings without exposing the credential', async () => {
    const service = createModelSettingsService({
      path: await path(),
      source: {
        OPENAI_BASE_URL: input.baseUrl,
        OPENAI_MODEL: input.model,
        OPENAI_API_KEY: input.apiKey,
      },
    })
    expect(service.get()).toMatchObject({ source: 'environment', hasApiKey: true })
    await service.save({ ...input, apiKey: '' })
    expect(JSON.stringify(service.get())).not.toContain(input.apiKey)
  })
  it('rejects empty initial keys, credential URLs and header injection', async () => {
    const service = createModelSettingsService({ path: await path(), source: {} })
    await expect(service.save({ ...input, apiKey: '' })).rejects.toMatchObject({
      code: 'API_KEY_REQUIRED',
    })
    for (const override of [
      { baseUrl: 'https://user:secret@example.com/v1' },
      { baseUrl: 'https://example.com/v1?key=secret' },
      { baseUrl: 'file:///tmp/key' },
      { baseUrl: 'https://example.com/v1/chat/completions' },
      { apiKey: 'key\r\nOther: secret' },
      { timeoutMs: 0 },
      { model: ' ' },
    ])
      expect(modelSettingsInputSchema.safeParse({ ...input, ...override }).success).toBe(false)
  })
  it('keeps corrupt files and reports real disk failures', async () => {
    const file = await path()
    await writeFile(file, '{corrupt', 'utf8')
    const service = createModelSettingsService({ path: file, source: {} })
    await expect(service.save(input)).rejects.toMatchObject({ code: 'MODEL_SETTINGS_CORRUPT' })
    expect(await readFile(file, 'utf8')).toBe('{corrupt')
    const impossible = createModelSettingsService({ path: join(file, 'nested.json'), source: {} })
    await expect(impossible.save(input)).rejects.toMatchObject({
      code: 'MODEL_SETTINGS_SAVE_FAILED',
    })
  })
})
describe('model settings HTTP API and connection test', () => {
  it.each(['/api/settings/model', '/api/v1/settings/model'])(
    'serves safe configuration at %s',
    async (endpoint) => {
      const modelSettings = createModelSettingsService({ path: await path(), source: {} }),
        app = createApp({ modelSettings })
      const saved = await request(app)
        .put(endpoint)
        .set('X-Settings-Request', '1')
        .send(input)
        .expect(200)
      expect(modelSettingsResponseSchema.safeParse(saved.body).success).toBe(true)
      expect(JSON.stringify(saved.body)).not.toContain(input.apiKey)
      const result = await request(app).get(endpoint).set('X-Settings-Request', '1').expect(200)
      expect(result.body.data.hasApiKey).toBe(true)
      expect(result.headers['cache-control']).toBe('no-store')
      expect(result.body.data).not.toHaveProperty('apiKey')
    },
  )
  it('rejects untrusted sites and missing application headers', async () => {
    const app = createApp({
      modelSettings: createModelSettingsService({ path: await path(), source: {} }),
    })
    await request(app).put('/api/settings/model').send(input).expect(403)
    await request(app)
      .put('/api/settings/model')
      .set('X-Settings-Request', '1')
      .set('Origin', 'https://untrusted.invalid')
      .send(input)
      .expect(403)
    await request(app)
      .put('/api/settings/model')
      .set('X-Settings-Request', '1')
      .set('Host', 'untrusted.invalid')
      .send(input)
      .expect(403)
  })
  it('tests submitted unsaved values through the real HTTP model protocol without persisting them', async () => {
    let payload: Record<string, unknown> | undefined,
      auth = ''
    const server = createServer(async (incoming, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
      payload = JSON.parse(Buffer.concat(chunks).toString())
      auth = incoming.headers.authorization ?? ''
      expect(incoming.url).toBe('/v1/chat/completions')
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          model: 'local-protocol-fixture',
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
        }),
      )
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number },
      file = await path()
    const modelSettings = createModelSettingsService({ path: file, source: {} })
    const result = await request(createApp({ modelSettings }))
      .post('/api/settings/model/test')
      .set('X-Settings-Request', '1')
      .send({ ...input, baseUrl: `http://127.0.0.1:${address.port}/v1` })
      .expect(200)
    expect(modelConnectionResponseSchema.safeParse(result.body).success).toBe(true)
    expect(auth).toBe('Bearer ' + input.apiKey)
    expect(payload!.model).toBe(input.model)
    expect(payload).toHaveProperty('response_format.json_schema.strict', true)
    expect(modelSettings.get().source).toBe('default')
    expect(JSON.stringify(result.body)).not.toContain(input.apiKey)
  })
  it.each([401, 429, 500])(
    'reports HTTP %s failures without leaking upstream content',
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ error: input.apiKey }, { status }))
      const app = createApp({
        modelSettings: createModelSettingsService({ path: await path(), source: {}, transport }),
      })
      const response = await request(app)
        .post('/api/settings/model/test')
        .set('X-Settings-Request', '1')
        .send(input)
      expect(response.body.success).toBe(false)
      expect(JSON.stringify(response.body)).not.toContain(input.apiKey)
    },
  )
  it('rejects structurally invalid model output', async () => {
    const service = createModelSettingsService({
      path: await path(),
      source: {},
      transport: vi.fn<typeof fetch>().mockResolvedValue(completion({ ok: false })),
    })
    await expect(service.test(input)).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' })
  })
  it('honors model timeout without reporting success', async () => {
    vi.useFakeTimers()
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options!.signal!.addEventListener('abort', () => reject(new Error('timeout'))),
          ),
      )
    const service = createModelSettingsService({ path: await path(), source: {}, transport })
    const pending = expect(service.test(input)).rejects.toMatchObject({ code: 'AI_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(1001)
    await pending
  })
})
