import { MODEL_REQUEST_TIMEOUT_MS } from '@defense/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defenseApi } from '../services/defense-api'
import { defenseFixture } from '../../../../tests/fixtures/defense'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('defense API transport', () => {
  it('validates the new request ID for retraining rather than the old source ID', async () => {
    const source = defenseFixture(),
      next = { ...defenseFixture(), id: crypto.randomUUID() }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => Response.json({ success: true, data: next })),
    )
    expect(
      await defenseApi('/' + source.id + '/retrain', { requestId: next.id, judgeId: 'business' }),
    ).toEqual(next)
    await expect(
      defenseApi('/' + source.id + '/retrain', {
        requestId: crypto.randomUUID(),
        judgeId: 'business',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('validates a recovered session and rejects mismatched IDs', async () => {
    const session = defenseFixture('demo')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ success: true, data: session })),
    )
    expect(await defenseApi('/' + session.id)).toEqual(session)
    await expect(defenseApi('/' + crypto.randomUUID())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
  it('reports clear session errors and network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            { success: false, error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' } },
            { status: 404 },
          ),
        )
        .mockRejectedValueOnce(new TypeError('offline')),
    )
    await expect(defenseApi('/' + defenseFixture().id)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    })
    await expect(defenseApi('/' + defenseFixture().id)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })
  it('times out JSON requests without pretending the server rolled back', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_done, reject) =>
            options.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      ),
    )
    const pending = expect(defenseApi('/' + defenseFixture().id)).rejects.toMatchObject({
      code: 'CLIENT_TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(MODEL_REQUEST_TIMEOUT_MS + 1)
    await pending
  })
})
