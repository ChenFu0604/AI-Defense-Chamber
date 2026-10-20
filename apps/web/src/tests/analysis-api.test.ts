import { MODEL_REQUEST_TIMEOUT_MS } from '@defense/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisApiError, requestProjectAnalysis } from '../services/analysis-api'
import { analysisFixture, analysisProject } from '../../../../tests/fixtures/analysis'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('analysis API client', () => {
  it('sends only the selected project and explicit mode and validates the result', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data: analysisFixture() })))
    vi.stubGlobal('fetch', fetcher)
    expect(await requestProjectAnalysis(analysisProject, 'live')).toEqual(analysisFixture())
    const [url, options] = fetcher.mock.calls[0]!
    expect(url).toBe('/api/v1/projects/analyze')
    expect(JSON.parse(String(options?.body))).toEqual({ project: analysisProject, mode: 'live' })
    expect(options?.headers).not.toHaveProperty('Authorization')
  })
  it('preserves actionable backend configuration errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'AI_NOT_CONFIGURED', message: '请配置服务端模型' },
          }),
          { status: 503 },
        ),
      ),
    )
    await expect(requestProjectAnalysis(analysisProject, 'live')).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
      message: '请配置服务端模型',
    })
  })
  it('handles malformed HTTP bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 })),
    )
    await expect(requestProjectAnalysis(analysisProject, 'live')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
  it.each([
    { success: true, data: {} },
    { success: true, data: analysisFixture('demo') },
    {
      success: true,
      data: { ...analysisFixture(), projectId: '55555555-5555-4555-8555-555555555555' },
    },
  ])('rejects invalid results and wrong provenance', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))))
    await expect(requestProjectAnalysis(analysisProject, 'live')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
  it('rejects a returned snapshot that differs from the request', async () => {
    const record = analysisFixture()
    record.projectSnapshot.name = '另一个项目'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: record }))),
    )
    await expect(requestProjectAnalysis(analysisProject, 'live')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
  it('reports network failures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    await expect(requestProjectAnalysis(analysisProject, 'live')).rejects.toBeInstanceOf(
      AnalysisApiError,
    )
    await expect(requestProjectAnalysis(analysisProject, 'live')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })
  it('distinguishes a user cancellation from a timeout', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Abort', 'AbortError')),
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    const pending = requestProjectAnalysis(analysisProject, 'live', controller.signal)
    const assertion = expect(pending).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' })
    controller.abort()
    await assertion
  })
  it('has a bounded client deadline', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Abort', 'AbortError')),
              { once: true },
            )
          }),
      ),
    )
    const pending = requestProjectAnalysis(analysisProject, 'live')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'CLIENT_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(130000)
    expect(vi.mocked(fetch).mock.calls[0]![1]!.signal!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(MODEL_REQUEST_TIMEOUT_MS - 130000)
    await assertion
  })
  it('receives backend timeout guidance after the old browser deadline without an automatic retry', async () => {
    vi.useFakeTimers()
    const message = '模型调用超过 180 秒等待上限。请在系统设置中延长请求超时。'
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                Response.json(
                  { success: false, error: { code: 'AI_TIMEOUT', message } },
                  { status: 504 },
                ),
              ),
            180000,
          )
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const assertion = expect(requestProjectAnalysis(analysisProject, 'live')).rejects.toMatchObject(
      { code: 'AI_TIMEOUT', message },
    )
    await vi.advanceTimersByTimeAsync(180000)
    await assertion
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
