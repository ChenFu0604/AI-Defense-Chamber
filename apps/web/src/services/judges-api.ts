import { MODEL_REQUEST_TIMEOUT_MS } from '@defense/shared'
import {
  apiErrorResponseSchema,
  judgeResponseSchema,
  questionsAreSimilar,
  type JudgeQuestionRequest,
  type JudgeStatement,
} from '@defense/shared'

export class JudgeApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'JudgeApiError'
  }
}
export async function requestJudgeQuestion(
  request: JudgeQuestionRequest,
  signal?: AbortSignal,
): Promise<JudgeStatement> {
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, MODEL_REQUEST_TIMEOUT_MS)
  try {
    controller.signal.throwIfAborted()
    const response = await fetch('/api/v1/judges/question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw new JudgeApiError('INVALID_RESPONSE', '提问服务返回格式异常，请重试。')
    }
    if (!response.ok) {
      const error = apiErrorResponseSchema.safeParse(raw)
      throw error.success
        ? new JudgeApiError(error.data.error.code, error.data.error.message)
        : new JudgeApiError('HTTP_ERROR', '提问服务暂时不可用。')
    }
    const parsed = judgeResponseSchema.safeParse(raw)
    if (
      !parsed.success ||
      parsed.data.data.projectId !== request.project.id ||
      parsed.data.data.analysisId !== request.analysis.id ||
      parsed.data.data.mode !== request.mode ||
      parsed.data.data.speech.judgeId !== request.judgeId ||
      request.history.some((item) =>
        questionsAreSimilar(item.question, parsed.data.data.speech.question),
      )
    )
      throw new JudgeApiError(
        'INVALID_RESPONSE',
        '评委结果结构、角色、来源或项目不一致，或出现重复提问，结果未加入本轮。',
      )
    controller.signal.throwIfAborted()
    return parsed.data.data
  } catch (error) {
    if (controller.signal.aborted)
      throw new JudgeApiError(
        timedOut ? 'CLIENT_TIMEOUT' : 'REQUEST_CANCELLED',
        timedOut ? '提问请求超时，请重试。' : '提问已取消。',
      )
    if (error instanceof JudgeApiError) throw error
    throw new JudgeApiError('NETWORK_ERROR', '无法连接提问服务，请检查后端与网络。')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
