import { MODEL_REQUEST_TIMEOUT_MS } from '@defense/shared'
import { apiErrorResponseSchema, defenseResponseSchema, type DefenseSession } from '@defense/shared'

export class DefenseApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'DefenseApiError'
  }
}
export async function defenseApi(path: string, body?: unknown): Promise<DefenseSession> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MODEL_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch('/api/v1/defense/sessions' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      throw new DefenseApiError('INVALID_RESPONSE', '服务返回格式异常，请刷新会话状态。')
    }
    if (!response.ok) {
      const error = apiErrorResponseSchema.safeParse(raw)
      throw error.success
        ? new DefenseApiError(error.data.error.code, error.data.error.message)
        : new DefenseApiError('HTTP_ERROR', '答辩服务请求失败，请重试。')
    }
    const parsed = defenseResponseSchema.safeParse(raw)
    const expectedId =
      path.endsWith('/retrain') && typeof body === 'object' && body !== null && 'requestId' in body
        ? body.requestId
        : path.split('/')[1]
    if (!parsed.success || (expectedId && parsed.data.data.id !== expectedId))
      throw new DefenseApiError('INVALID_RESPONSE', '会话结构或标识异常，请刷新状态后重试。')
    return parsed.data.data
  } catch (error) {
    if (error instanceof DefenseApiError) throw error
    throw new DefenseApiError(
      controller.signal.aborted ? 'CLIENT_TIMEOUT' : 'NETWORK_ERROR',
      controller.signal.aborted
        ? '请求超时，服务端可能仍在处理，请刷新状态或重试原操作。'
        : '无法连接答辩服务，输入已保留，请检查网络后重试。',
    )
  } finally {
    clearTimeout(timer)
  }
}
