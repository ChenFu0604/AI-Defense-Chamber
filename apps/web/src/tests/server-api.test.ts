import { z } from 'zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serverRequest } from '../services/server-api'
const responseSchema = z.strictObject({success: z.literal(true), data: z.strictObject({id: z.string()})})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('authoritative record API client', () => {
  it('validates fresh reads and sends explicit local import headers without persisting credentials', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({success: true, data: {id: 'test'}}))
    vi.stubGlobal('fetch', fetcher)
    expect(await serverRequest('/projects', responseSchema)).toEqual({id: 'test'})
    expect(fetcher.mock.calls[0]).toMatchObject(['/api/v1/projects', {method: 'GET', cache: 'no-store', headers: {'X-Workspace-Request': '1'}}])
    await serverRequest('/projects', responseSchema, {method: 'POST', body: {name: '测试'}})
    expect(fetcher.mock.calls[1]![1].body).toBe(JSON.stringify({name: '测试'}))
  })
  it('surfaces conflicts, malformed data and network failures without a local success fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({success: false, error: {code: 'WORKSPACE_CONFLICT', message: '已变化'}}, {status: 409})))
    await expect(serverRequest('/projects', responseSchema)).rejects.toMatchObject({code: 'WORKSPACE_CONFLICT', message: '已变化'})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({success: true, data: {id: 42}})))
    await expect(serverRequest('/projects', responseSchema)).rejects.toMatchObject({code: 'INVALID_RESPONSE'})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(serverRequest('/projects', responseSchema)).rejects.toMatchObject({code: 'NETWORK_ERROR'})
  })
  it('cancels pending reads and retains explicit uncertainty about server writes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const pending = expect(serverRequest('/projects', responseSchema)).rejects.toMatchObject({code: 'REQUEST_CANCELLED', message: expect.stringContaining('服务端可能已保存')})
    await vi.advanceTimersByTimeAsync(30000)
    await pending
  })
})
