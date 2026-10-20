import { createServer } from 'node:http'
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { modelListRequestSchema, modelSettingsInputSchema } from '@defense/shared'
import { createApp } from '../app.js'
import { createModelSettingsService } from '../services/model-settings-service.js'
import { fetchModelList } from '../services/model-list-client.js'

const config = {
  baseUrl: 'https://fixture.invalid/v1',
  apiKey: 'fixture-model-list-key',
  timeoutMs: 1000,
}
afterEach(() => vi.useRealTimers())
describe('OpenAI compatible model listing', () => {
  it('requires endpoint credentials but not a chosen model', () => {
    expect(modelListRequestSchema.safeParse(config).success).toBe(true)
    expect(modelSettingsInputSchema.safeParse(config).success).toBe(false)
  })
  it('sorts and deduplicates model IDs, stripping provider-only metadata', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({
          object: 'list',
          data: [
            { id: 'z-fixture', owned_by: 'provider' },
            { id: 'a-fixture' },
            { id: 'z-fixture' },
          ],
        }),
      )
    expect(await fetchModelList(config, transport)).toEqual({ models: ['a-fixture', 'z-fixture'] })
    expect(transport.mock.calls[0]![0]).toBe(config.baseUrl + '/models')
    expect(transport.mock.calls[0]![1]).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: 'Bearer ' + config.apiKey },
    })
    expect(transport.mock.calls[0]![1]?.body).toBeUndefined()
  })
  it('returns an actual empty list without inventing models', async () => {
    expect(
      await fetchModelList(
        config,
        vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [] })),
      ),
    ).toEqual({ models: [] })
  })
  it.each([
    [401, 'AI_AUTH_ERROR'],
    [403, 'AI_AUTH_ERROR'],
    [429, 'AI_RATE_LIMITED'],
    [404, 'MODEL_LIST_UNSUPPORTED'],
    [405, 'MODEL_LIST_UNSUPPORTED'],
    [500, 'MODEL_LIST_UNAVAILABLE'],
  ])('handles upstream %s without exposing provider errors', async (status, code) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: config.apiKey }, { status: Number(status) }))
    try {
      await fetchModelList(config, transport)
      throw new Error('expected failure')
    } catch (failure) {
      expect(failure).toMatchObject({ code })
      expect(String(failure)).not.toContain(config.apiKey)
    }
  })
  it.each([{ models: ['unexpected'] }, { data: [{ id: ' ' }] }, { data: 'invalid' }])(
    'rejects invalid model-list structures',
    async (raw) => {
      await expect(
        fetchModelList(config, vi.fn<typeof fetch>().mockResolvedValue(Response.json(raw))),
      ).rejects.toMatchObject({ code: 'MODEL_LIST_INVALID_OUTPUT' })
    },
  )
  it('rejects non-JSON output and oversized responses', async () => {
    await expect(
      fetchModelList(
        config,
        vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>not JSON</html>')),
      ),
    ).rejects.toMatchObject({ code: 'MODEL_LIST_INVALID_OUTPUT' })
    await expect(
      fetchModelList(
        config,
        vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(513 * 1024))),
      ),
    ).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' })
  })
  it('handles timeout, cancellation and network failure', async () => {
    vi.useFakeTimers()
    const stalled = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, options) =>
          new Promise((_done, reject) =>
            options!.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      )
    const pending = expect(fetchModelList(config, stalled)).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(1001)
    await pending
    const never = vi.fn<typeof fetch>()
    await expect(fetchModelList(config, never, AbortSignal.abort())).rejects.toMatchObject({
      code: 'REQUEST_CANCELLED',
    })
    expect(never).not.toHaveBeenCalled()
    await expect(
      fetchModelList(config, vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))),
    ).rejects.toMatchObject({ code: 'MODEL_LIST_CONNECTION_FAILED' })
  })
  it('uses a saved key without forwarding it to changed addresses or altering persisted settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'model-list-test-'))
    try {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ data: [{ id: 'fixture-choice' }] }))
      const service = createModelSettingsService({
        path: join(directory, 'config.json'),
        source: {},
        transport,
      })
      await service.save({ ...config, model: 'existing-model', responseFormat: 'json_schema' })
      const previous = service.get()
      expect(await service.listModels({ ...config, apiKey: '' })).toEqual({
        models: ['fixture-choice'],
      })
      expect(transport.mock.calls[0]![1]?.headers).toMatchObject({
        Authorization: 'Bearer ' + config.apiKey,
      })
      expect(service.get()).toEqual(previous)
      await expect(
        service.listModels({ ...config, apiKey: '', baseUrl: 'https://another.invalid/v1' }),
      ).rejects.toMatchObject({ code: 'API_KEY_REQUIRED' })
      expect(transport).toHaveBeenCalledTimes(1)
    } finally {
      for (const file of await readdir(directory)) await unlink(join(directory, file))
      await rmdir(directory)
    }
  })
  it('exercises the HTTP endpoint using a local model protocol fixture without a model name', async () => {
    let authorization = '',
      requestedPath = ''
    const server = createServer((incoming, outgoing) => {
      authorization = incoming.headers.authorization ?? ''
      requestedPath = incoming.url ?? ''
      outgoing.setHeader('Content-Type', 'application/json')
      outgoing.end(JSON.stringify({ data: [{ id: 'fixture-beta' }, { id: 'fixture-alpha' }] }))
    })
    const directory = await mkdtemp(join(tmpdir(), 'model-list-http-test-'))
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const port = (server.address() as { port: number }).port
      const service = createModelSettingsService({
        path: join(directory, 'config.json'),
        source: {},
      })
      const app = createApp({ modelSettings: service })
      const result = await request(app)
        .post('/api/v1/settings/model/models')
        .set('X-Settings-Request', '1')
        .send({ ...config, baseUrl: `http://127.0.0.1:${port}/v1` })
        .expect(200)
      expect(result.body).toEqual({
        success: true,
        data: { models: ['fixture-alpha', 'fixture-beta'] },
      })
      expect(requestedPath).toBe('/v1/models')
      expect(authorization).toBe('Bearer ' + config.apiKey)
      expect(result.headers['cache-control']).toBe('no-store')
      expect(await readdir(directory)).toEqual([])
      await request(app).post('/api/settings/model/models').send(config).expect(403)
      await request(app)
        .post('/api/settings/model/models')
        .set('X-Settings-Request', '1')
        .send({ ...config, baseUrl: 'invalid' })
        .expect(400)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rmdir(directory)
    }
  })
})
