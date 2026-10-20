import { z } from 'zod'
import {
  MODEL_REQUEST_TIMEOUT_MS,
  apiErrorResponseSchema,
  reportResponseSchema,
} from '@defense/shared'

export class ReportApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ReportApiError'
  }
}
export async function requestReport(id: string, generate = false, signal?: AbortSignal) {
  if (!z.uuid().safeParse(id).success)
    throw new ReportApiError('VALIDATION_ERROR', '会话 ID 无效。')
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(cancel, MODEL_REQUEST_TIMEOUT_MS)
  try {
    controller.signal.throwIfAborted()
    const response = await fetch(`/api/v1/defense/sessions/${id}/report`, {
      method: generate ? 'POST' : 'GET',
      signal: controller.signal,
    })
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ReportApiError('INVALID_RESPONSE', '报告服务返回格式异常，请重试读取。')
    }
    if (!response.ok) {
      const error = apiErrorResponseSchema.safeParse(body)
      throw new ReportApiError(
        error.success ? error.data.error.code : 'HTTP_ERROR',
        error.success ? error.data.error.message : '报告请求失败，请重试。',
      )
    }
    const parsed = reportResponseSchema.safeParse(body)
    if (!parsed.success || parsed.data.data.sessionId !== id)
      throw new ReportApiError('INVALID_RESPONSE', '报告结构、评分或会话标识异常，未使用此结果。')
    controller.signal.throwIfAborted()
    return parsed.data.data
  } catch (failure) {
    if (controller.signal.aborted)
      throw new ReportApiError(
        signal?.aborted ? 'REQUEST_CANCELLED' : 'CLIENT_TIMEOUT',
        signal?.aborted
          ? '报告请求已取消。'
          : '等待报告超时，服务端可能仍在生成，请先重新读取报告。',
      )
    if (failure instanceof ReportApiError) throw failure
    throw new ReportApiError('NETWORK_ERROR', '无法连接报告服务，请检查网络后重试。')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
