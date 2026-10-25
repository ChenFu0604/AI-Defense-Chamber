import { afterEach, describe, expect, it, vi } from 'vitest'
import { MODEL_REQUEST_TIMEOUT_MS } from '@defense/shared'
import { requestReport } from '../services/report-api'
import { legacyReportFixture, reportFixture } from '../../../../tests/fixtures/report'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('report API client', () => {
  it('reads persisted reports and explicitly generates with POST', async () => {
    const record = reportFixture(),
      fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json({ success: true, data: record }))
    vi.stubGlobal('fetch', fetcher)
    expect(await requestReport(record.sessionId)).toEqual(record)
    expect(await requestReport(record.sessionId, true)).toEqual(record)
    expect(fetcher.mock.calls[0]![1]!.method).toBe('GET')
    expect(fetcher.mock.calls[1]![1]!.method).toBe('POST')
    expect(fetcher.mock.calls[0]![0]).toBe(`/api/v1/defense/sessions/${record.sessionId}/report`)
  })
  it('accepts partial observations and unchanged legacy reports without fabricating a score', async () => {
    const partial = reportFixture()
    partial.output.dimensions.technical = {
      status: 'insufficient', score: null, reason: '本轮尚未讨论技术方案。', references: [],
    }
    partial.overallScore = null
    for (const record of [partial, legacyReportFixture()]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true, data: record })))
      expect(await requestReport(record.sessionId)).toEqual(record)
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true, data: { ...partial, overallScore: 0 } })))
    await expect(requestReport(partial.sessionId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('handles missing history and backend model failures without inventing scores', async () => {
    for (const [code, status] of [
      ['REPORT_NOT_FOUND', 404],
      ['AI_UNAVAILABLE', 502],
    ] as const) {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ success: false, error: { code, message: '测试提示' } }, { status }),
          ),
      )
      await expect(requestReport(reportFixture().sessionId)).rejects.toMatchObject({
        code,
        message: '测试提示',
      })
    }
  })
  it('rejects mismatched totals, wrong session IDs and malformed responses', async () => {
    const record = reportFixture()
    for (const data of [
      { ...record, overallScore: 100 },
      { ...record, sessionId: record.id },
      { output: {} },
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true, data })))
      await expect(requestReport(record.sessionId)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      })
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>')))
    await expect(requestReport(record.sessionId)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
  it('reports network failures, timeout recovery guidance and user cancellation', async () => {
    const id = reportFixture().sessionId
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    await expect(requestReport(id)).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () =>
            reject(new DOMException('abort', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const assertion = expect(requestReport(id, true)).rejects.toMatchObject({
      code: 'CLIENT_TIMEOUT',
      message: expect.stringContaining('重新读取'),
    })
    await vi.advanceTimersByTimeAsync(MODEL_REQUEST_TIMEOUT_MS)
    await assertion
    const controller = new AbortController()
    const cancelled = expect(requestReport(id, false, controller.signal)).rejects.toMatchObject({
      code: 'REQUEST_CANCELLED',
    })
    controller.abort()
    await cancelled
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
