import { afterEach, describe, expect, it, vi } from 'vitest'
import { MODEL_REQUEST_TIMEOUT_MS, type EmbeddingSettingsInput } from '@defense/shared'
import { getEmbeddingSettings, saveEmbeddingSettings, testEmbeddingConnection } from '../services/embedding-settings-api'
const config = {enabled: true, baseUrl: 'https://fixture.invalid/v1', model: 'embedding-fixture', timeoutMs: 45000, dimensions: null, minSimilarity: 0.35, hasApiKey: true, source: 'saved', status: 'configured', updatedAt: null}
const input: EmbeddingSettingsInput = {enabled: true, baseUrl: config.baseUrl, model: config.model, apiKey: 'fixture-secret', timeoutMs: config.timeoutMs, dimensions: null, minSimilarity: config.minSimilarity}
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers()})
describe('embedding settings API', () => {
  it('uses protected backend paths, validates public values and sends independent credentials', async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json({success: true, data: config})).mockResolvedValueOnce(Response.json({success: true, data: config})).mockResolvedValueOnce(Response.json({success: true, data: {model: config.model, dimensions: 3, latencyMs: 5}}))
    vi.stubGlobal('fetch', transport)
    expect((await getEmbeddingSettings()).hasApiKey).toBe(true)
    await saveEmbeddingSettings(input); expect((await testEmbeddingConnection(input)).dimensions).toBe(3)
    expect(transport.mock.calls.map(c => c[0])).toEqual(['/api/v1/settings/embedding', '/api/v1/settings/embedding', '/api/v1/settings/embedding/test'])
    expect(transport.mock.calls[1]![1]).toMatchObject({method: 'PUT', headers: {'X-Settings-Request': '1'}})
    expect(JSON.parse(transport.mock.calls[1]![1].body)).toEqual(input)
  })
  it('rejects key exposure, invalid tests and local validation before saving', async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json({success: true, data: {...config, apiKey: 'must-not-return'}})).mockResolvedValueOnce(Response.json({success: true, data: {model: config.model, dimensions: 0, latencyMs: 5}}))
    vi.stubGlobal('fetch', transport)
    await expect(getEmbeddingSettings()).rejects.toThrow('格式异常')
    await expect(testEmbeddingConnection(input)).rejects.toThrow('无效')
    await expect(saveEmbeddingSettings({...input, minSimilarity: 2})).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(2)
  })
  it('preserves backend failures and distinguishes unavailable network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({success: false, error: {code: 'EMBEDDING_AUTH_ERROR', message: '向量服务认证失败'}}, {status: 502})))
    await expect(testEmbeddingConnection(input)).rejects.toThrow('向量服务认证失败')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(getEmbeddingSettings()).rejects.toThrow('无法连接后端')
  })
  it('cancels timed out settings requests without a false success', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('abort'))))))
    const pending = expect(getEmbeddingSettings()).rejects.toThrow('请求超时')
    await vi.advanceTimersByTimeAsync(MODEL_REQUEST_TIMEOUT_MS + 1); await pending
  })
})
