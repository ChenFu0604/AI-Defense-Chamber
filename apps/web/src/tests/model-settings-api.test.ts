import { MODEL_REQUEST_TIMEOUT_MS } from '@defense/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getModelSettings,
  saveModelSettings,
  testModelConnection,
  listAvailableModels,
} from '../services/model-settings-api'
const config = {
  baseUrl: 'https://fixture.invalid/v1',
  model: 'fixture-model',
  timeoutMs: 45000,
  responseFormat: 'json_schema' as const,
  hasApiKey: true,
  source: 'saved',
  status: 'configured',
  updatedAt: '2026-10-20T10:00:00.000Z',
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('model settings API client', () => {
  it('fetches and validates a list without requiring a model ID', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true, data: { models: ['fixture-alpha'] } }))
    vi.stubGlobal('fetch', transport)
    expect(
      await listAvailableModels({ baseUrl: config.baseUrl, apiKey: '', timeoutMs: 1000 }),
    ).toEqual({ models: ['fixture-alpha'] })
    expect(transport.mock.calls[0]![0]).toBe('/api/v1/settings/model/models')
    expect(JSON.parse(transport.mock.calls[0]![1].body)).not.toHaveProperty('model')
  })
  it('uses application headers and backend-only save requests', async () => {
    const transport = vi
      .fn()
      .mockImplementation(async () => Response.json({ success: true, data: config }))
    vi.stubGlobal('fetch', transport)
    expect((await getModelSettings()).hasApiKey).toBe(true)
    const input = {
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: 'fixture-secret',
      timeoutMs: config.timeoutMs,
      responseFormat: config.responseFormat,
    }
    await saveModelSettings(input)
    expect(transport.mock.calls[1]![0]).toBe('/api/v1/settings/model')
    expect(transport.mock.calls[1]![1]).toMatchObject({
      method: 'PUT',
      headers: { 'X-Settings-Request': '1' },
    })
    expect(JSON.parse(transport.mock.calls[1]![1].body).apiKey).toBe(input.apiKey)
  })
  it('rejects accidental key exposure in read responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ success: true, data: { ...config, apiKey: 'must-not-return' } }),
        ),
    )
    await expect(getModelSettings()).rejects.toThrow('格式异常')
  })
  it('reports connection errors instead of successful tests', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { success: false, error: { code: 'AI_AUTH_ERROR', message: '模型认证失败' } },
            { status: 502 },
          ),
        ),
    )
    await expect(testModelConnection({ ...config, apiKey: '' })).rejects.toThrow('模型认证失败')
  })
  it('times out an unresponsive settings request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_done, reject) =>
            options.signal?.addEventListener('abort', () => reject(new Error('abort'))),
          ),
      ),
    )
    const pending = expect(getModelSettings()).rejects.toThrow('请求超时')
    await vi.advanceTimersByTimeAsync(MODEL_REQUEST_TIMEOUT_MS + 1)
    await pending
  })
})
