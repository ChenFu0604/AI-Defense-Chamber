import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JudgeQuestionRequest } from '@defense/shared'
import { JudgeApiError, requestJudgeQuestion } from '../services/judges-api'
import { analysisFixture, analysisProject } from '../../../../tests/fixtures/analysis'
const input: JudgeQuestionRequest = {
  project: analysisProject,
  analysis: analysisFixture(),
  judgeId: 'business',
  mode: 'live',
  history: [],
}
function body() {
  return {
    success: true,
    data: {
      id: crypto.randomUUID(),
      projectId: analysisProject.id,
      analysisId: analysisFixture().id,
      createdAt: new Date().toISOString(),
      mode: 'live',
      model: 'fixture',
      speech: {
        judgeId: 'business',
        question: '如何验证校园循环项目的市场需求？',
        questionType: 'evidence',
        riskLevel: 'medium',
        focus: '需求',
        rationale: '需要证据',
      },
    },
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('judge API client', () => {
  it('returns a checked structured speech', async () => {
    const value = body()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)))
    expect(await requestJudgeQuestion(input)).toEqual(value.data)
  })
  it.each(['judge', 'analysis', 'mode', 'shape', 'duplicate'])(
    'rejects a mismatched %s response',
    async (kind) => {
      const value = body()
      if (kind === 'judge') value.data.speech.judgeId = 'technical'
      if (kind === 'analysis') value.data.analysisId = crypto.randomUUID()
      if (kind === 'mode') {
        value.data.mode = 'demo'
        value.data.model = ''
      }
      if (kind === 'shape') value.data.speech.riskLevel = 'unknown'
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)))
      await expect(
        requestJudgeQuestion({
          ...input,
          history:
            kind === 'duplicate'
              ? [value.data.speech as JudgeQuestionRequest['history'][number]]
              : [],
        }),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    },
  )
  it('preserves server configuration guidance', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { success: false, error: { code: 'AI_NOT_CONFIGURED', message: '请配置服务端模型' } },
            { status: 503 },
          ),
        ),
    )
    await expect(requestJudgeQuestion(input)).rejects.toEqual(
      new JudgeApiError('AI_NOT_CONFIGURED', '请配置服务端模型'),
    )
  })
  it('reports a network failure without demo fallback', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('network'))
    vi.stubGlobal('fetch', fetcher)
    await expect(requestJudgeQuestion(input)).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('times out an unresponsive request and aborts transport', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_done, reject) => {
            options.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
    )
    const expected = expect(requestJudgeQuestion(input)).rejects.toMatchObject({
      code: 'CLIENT_TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(130001)
    await expected
  })
  it('honors a pre-cancelled signal without sending', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(requestJudgeQuestion(input, AbortSignal.abort())).rejects.toMatchObject({
      code: 'REQUEST_CANCELLED',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
