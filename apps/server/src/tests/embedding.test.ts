import { mkdtemp, readdir, readFile, unlink, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { embeddingSettingsInputSchema, embeddingSettingsResponseSchema, embeddingConnectionResponseSchema } from '@defense/shared'
import { createApp } from '../app.js'
import { readEmbeddingConfig, type EmbeddingConfig } from '../config/embedding.js'
import { createEmbeddingClient } from '../services/embedding-client.js'
import { createEmbeddingSettingsService } from '../services/embedding-settings-service.js'

const config: EmbeddingConfig = { enabled: true, baseUrl: 'https://embedding.fixture.invalid/v1', model: 'fixture-embedding', apiKey: 'fixture-embedding-key', timeoutMs: 1000, dimensions: null, minSimilarity: 0.35 }
const output = (data: unknown = [{ index: 0, embedding: [1, 0, 0] }]) => Response.json({ model: config.model, data })
const directories: string[] = []
async function path() {
  const directory = await mkdtemp(join(tmpdir(), 'embedding-test-'))
  directories.push(directory)
  return join(directory, 'embedding-config.json')
}
afterEach(async () => {
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    for (const file of await readdir(directory)) await unlink(join(directory, file))
    await rmdir(directory)
  }
})
describe('OpenAI compatible Embedding client', () => {
  it('posts bounded float batches and restores vector input order', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(output([{ index: 1, embedding: [0, 1, 0] }, { index: 0, embedding: [1, 0, 0] }]))
    const result = await createEmbeddingClient(transport).embed(['收入预测', '使用场景'], { ...config, dimensions: 3 })
    expect(result).toEqual({ model: config.model, vectors: [[1, 0, 0], [0, 1, 0]] })
    expect(transport.mock.calls[0]![0]).toBe(config.baseUrl + '/embeddings')
    expect(transport.mock.calls[0]![1]).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer ' + config.apiKey } })
    expect(JSON.parse(String(transport.mock.calls[0]![1]?.body))).toEqual({ model: config.model, input: ['收入预测', '使用场景'], encoding_format: 'float', dimensions: 3 })
  })
  it('does not invent dimensions or call the provider for invalid input', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(output())
    await createEmbeddingClient(transport).embed(['测试'], config)
    expect(JSON.parse(String(transport.mock.calls[0]![1]?.body))).not.toHaveProperty('dimensions')
    for (const input of [[], [' '], ['x'.repeat(901)], Array.from({length: 33}, () => '测试')])
      await expect(createEmbeddingClient(transport).embed(input, config)).rejects.toMatchObject({ code: 'EMBEDDING_INPUT_INVALID' })
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it.each([
    [], [{ index: 1, embedding: [1, 0] }], [{ index: 0, embedding: [0, 0] }],
    [{ index: 0, embedding: [] }], [{ index: 0, embedding: [null, 1] }],
    [{ index: 0, embedding: Array(4097).fill(1) }],
  ].map((data) => ({data})))('rejects malformed or missing vectors', async ({data}) => {
    await expect(createEmbeddingClient(vi.fn<typeof fetch>().mockResolvedValue(output(data))).embed(['测试'], config)).rejects.toMatchObject({ code: 'EMBEDDING_INVALID_OUTPUT' })
  })
  it('rejects duplicate indexes, mismatched dimensions, non-JSON and oversized bodies', async () => {
    for (const data of [
      [{index: 0, embedding: [1, 0]}, {index: 0, embedding: [0, 1]}],
      [{index: 0, embedding: [1, 0]}, {index: 1, embedding: [0, 1, 0]}],
    ]) await expect(createEmbeddingClient(vi.fn<typeof fetch>().mockResolvedValue(output(data))).embed(['甲', '乙'], config)).rejects.toMatchObject({ code: 'EMBEDDING_INVALID_OUTPUT' })
    await expect(createEmbeddingClient(vi.fn<typeof fetch>().mockResolvedValue(output())).embed(['测试'], {...config, dimensions: 2})).rejects.toMatchObject({ code: 'EMBEDDING_INVALID_OUTPUT' })
    for (const response of [new Response('<html>invalid</html>'), new Response('x'.repeat(8 * 1024 * 1024 + 1))])
      await expect(createEmbeddingClient(vi.fn<typeof fetch>().mockResolvedValue(response)).embed(['测试'], config)).rejects.toMatchObject({ code: 'EMBEDDING_INVALID_OUTPUT' })
  })
  it.each([[401, 'EMBEDDING_AUTH_ERROR'], [403, 'EMBEDDING_AUTH_ERROR'], [429, 'EMBEDDING_RATE_LIMITED'], [404, 'EMBEDDING_UNAVAILABLE'], [500, 'EMBEDDING_UNAVAILABLE']])('reports provider %s without leaking its response', async (status, code) => {
    const client = createEmbeddingClient(vi.fn<typeof fetch>().mockResolvedValue(Response.json({error: config.apiKey}, {status: Number(status)})))
    const failure = await client.embed(['测试'], config).catch((error: unknown) => error)
    expect(failure).toMatchObject({code})
    expect(String(failure)).not.toContain(config.apiKey)
  })
  it('handles cancellation, network errors and timeout', async () => {
    const unused = vi.fn<typeof fetch>()
    await expect(createEmbeddingClient(unused).embed(['测试'], config, AbortSignal.abort())).rejects.toMatchObject({code: 'REQUEST_CANCELLED'})
    expect(unused).not.toHaveBeenCalled()
    await expect(createEmbeddingClient(vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))).embed(['测试'], config)).rejects.toMatchObject({code: 'EMBEDDING_CONNECTION_FAILED'})
    vi.useFakeTimers()
    const stalled = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new Error('aborted')))))
    const pending = expect(createEmbeddingClient(stalled).embed(['测试'], config)).rejects.toMatchObject({code: 'EMBEDDING_TIMEOUT'})
    await vi.advanceTimersByTimeAsync(1001)
    await pending
  })
  it('cancels a stalled response body when its deadline expires', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({cancel})
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream))
    const pending = expect(createEmbeddingClient(transport).embed(['测试'], config)).rejects.toMatchObject({code: 'EMBEDDING_TIMEOUT'})
    await vi.advanceTimersByTimeAsync(1001)
    await pending
    expect(cancel).toHaveBeenCalledOnce()
  })
})
describe('Embedding backend settings', () => {
  it('starts disabled, persists atomically and restores independent credentials', async () => {
    const file = await path()
    const service = createEmbeddingSettingsService({ path: file, source: {} })
    expect(service.get()).toMatchObject({ enabled: false, status: 'not_configured', source: 'default', hasApiKey: false })
    const saved = await service.save(config)
    expect(saved).toMatchObject({ enabled: true, hasApiKey: true, source: 'saved', status: 'configured' })
    expect(JSON.stringify(saved)).not.toContain(config.apiKey)
    expect(createEmbeddingSettingsService({ path: file, source: {} }).get()).toEqual(saved)
    expect(readEmbeddingConfig(undefined, file)).toEqual(config)
    expect(await readdir(directories.at(-1)!)).toEqual(['embedding-config.json'])
    await service.save({...config, enabled: false, model: '', apiKey: ''})
    expect(service.get()).toMatchObject({ enabled: false, status: 'not_configured', hasApiKey: true })
    expect(() => readEmbeddingConfig(undefined, file)).toThrow(expect.objectContaining({code: 'EMBEDDING_NOT_CONFIGURED'}))
  })
  it('preserves blank keys but never forwards saved credentials to another endpoint', async () => {
    const file = await path()
    const transport = vi.fn<typeof fetch>().mockResolvedValue(output())
    const service = createEmbeddingSettingsService({ path: file, source: {}, transport })
    await service.save(config)
    await service.save({...config, apiKey: '', model: 'new-model'})
    expect(readEmbeddingConfig(undefined, file).apiKey).toBe(config.apiKey)
    await expect(service.test({...config, apiKey: '', baseUrl: 'https://other.fixture.invalid/v1'})).rejects.toMatchObject({code: 'API_KEY_REQUIRED'})
    await expect(service.save({...config, apiKey: '', baseUrl: 'https://other.fixture.invalid/v1'})).rejects.toMatchObject({code: 'API_KEY_REQUIRED'})
    expect(transport).not.toHaveBeenCalled()
  })
  it('requires dedicated environment settings, never reuses chat credentials, and redacts bad URLs', async () => {
    expect(() => readEmbeddingConfig({OPENAI_API_KEY: 'chat-key', OPENAI_MODEL: 'chat-model'})).toThrow(expect.objectContaining({code: 'EMBEDDING_NOT_CONFIGURED'}))
    expect(() => readEmbeddingConfig({EMBEDDING_ENABLED: 'true', OPENAI_API_KEY: 'chat-key'})).toThrow(expect.objectContaining({code: 'EMBEDDING_CONFIG_INVALID'}))
    const source = {EMBEDDING_ENABLED: 'true', EMBEDDING_BASE_URL: config.baseUrl, EMBEDDING_MODEL: config.model, EMBEDDING_API_KEY: config.apiKey, EMBEDDING_TIMEOUT_MS: '1000'}
    expect(readEmbeddingConfig(source)).toEqual(config)
    const service = createEmbeddingSettingsService({path: await path(), source})
    expect(service.get()).toMatchObject({ source: 'environment', status: 'configured', hasApiKey: true })
    const bad = createEmbeddingSettingsService({path: await path(), source: {...source, EMBEDDING_BASE_URL: 'https://name:private-password@fixture.invalid/v1?key=private-query'}}).get()
    expect(bad.status).toBe('configuration_error')
    expect(JSON.stringify(bad)).not.toMatch(/private-password|private-query|fixture-embedding-key/)
  })
  it('validates endpoint shapes, enabled model requirement and dimensions', () => {
    expect(embeddingSettingsInputSchema.safeParse({...config, enabled: false, model: ''}).success).toBe(true)
    for (const override of [{model: ''}, {dimensions: 0}, {dimensions: 4097}, {minSimilarity: 1.1}, {apiKey: 'key\r\nother'}, {baseUrl: 'not-a-url'}, {baseUrl: 'https://fixture.invalid/v1/embeddings'}, {baseUrl: 'https://fixture.invalid/v1/chat/completions'}, {baseUrl: 'https://fixture.invalid/v1/models'}, {baseUrl: 'https://name:password@fixture.invalid/v1'}])
      expect(embeddingSettingsInputSchema.safeParse({...config, ...override}).success).toBe(false)
  })
  it('preserves corrupt files and reports disk errors', async () => {
    const file = await path()
    await writeFile(file, '{broken')
    await expect(createEmbeddingSettingsService({path: file, source: {}}).save(config)).rejects.toMatchObject({code: 'EMBEDDING_SETTINGS_CORRUPT'})
    expect(await readFile(file, 'utf8')).toBe('{broken')
    await expect(createEmbeddingSettingsService({path: join(file, 'nested.json'), source: {}}).save(config)).rejects.toMatchObject({code: 'EMBEDDING_SETTINGS_SAVE_FAILED'})
  })
  it.each(['/api/settings/embedding', '/api/v1/settings/embedding'])('protects and serves %s without disclosing keys', async (endpoint) => {
    const service = createEmbeddingSettingsService({path: await path(), source: {}})
    const app = createApp({embeddingSettings: service})
    await request(app).get(endpoint).expect(403)
    await request(app).put(endpoint).set('X-Settings-Request', '1').set('Origin', 'https://untrusted.invalid').send(config).expect(403)
    await request(app).put(endpoint).set('X-Settings-Request', '1').set('Host', 'untrusted.invalid').send(config).expect(403)
    const saved = await request(app).put(endpoint).set('X-Settings-Request', '1').send(config).expect(200)
    expect(embeddingSettingsResponseSchema.safeParse(saved.body).success).toBe(true)
    expect(JSON.stringify(saved.body)).not.toContain(config.apiKey)
    const restored = await request(app).get(endpoint).set('X-Settings-Request', '1').expect(200)
    expect(restored.headers['cache-control']).toBe('no-store')
    expect(restored.body.data).not.toHaveProperty('apiKey')
    await request(app).put(endpoint).set('X-Settings-Request', '1').send({...config, dimensions: -1}).expect(400)
  })
  it('tests the real HTTP /embeddings protocol using fixed test text without saving or sending project data', async () => {
    let received: Record<string, unknown> | undefined, authorization = '', url = ''
    const server = createServer(async (incoming, outgoing) => {
      const chunks: Buffer[] = []
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
      received = JSON.parse(Buffer.concat(chunks).toString())
      authorization = incoming.headers.authorization ?? ''; url = incoming.url ?? ''
      outgoing.setHeader('Content-Type', 'application/json')
      outgoing.end(JSON.stringify({model: config.model, data: [{index: 0, embedding: [0.5, 0.5, 0.2]}]}))
    })
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const port = (server.address() as {port: number}).port
      const service = createEmbeddingSettingsService({path: await path(), source: {}})
      const result = await request(createApp({embeddingSettings: service})).post('/api/v1/settings/embedding/test').set('X-Settings-Request', '1').send({...config, enabled: false, baseUrl: `http://127.0.0.1:${port}/v1`}).expect(200)
      expect(embeddingConnectionResponseSchema.safeParse(result.body).success).toBe(true)
      expect(result.body.data.dimensions).toBe(3)
      expect(received).toMatchObject({model: config.model, encoding_format: 'float', input: ['连接测试：验证文本向量接口，不含项目资料。']})
      expect(url).toBe('/v1/embeddings')
      expect(authorization).toBe('Bearer ' + config.apiKey)
      expect(service.get().source).toBe('default')
      expect(await readdir(directories.at(-1)!)).toEqual([])
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
  })
})
