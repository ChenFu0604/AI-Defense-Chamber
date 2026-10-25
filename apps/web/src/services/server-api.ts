import { z } from 'zod'
import { apiErrorResponseSchema } from '@defense/shared'

export class ServerApiError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'ServerApiError' }
}
export async function serverRequest<T>(
  path: string,
  schema: z.ZodType<{ success: true; data: T }>,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  options.signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(cancel, 30000)
  try {
    const response = await fetch('/api/v1' + path, {
      method: options.method ?? 'GET', cache: 'no-store', signal: controller.signal,
      headers: { 'X-Workspace-Request': '1', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
    let raw: unknown
    try { raw = await response.json() }
    catch { throw new ServerApiError('INVALID_RESPONSE', '服务端数据格式异常，请检查前后端版本是否一致。') }
    if (!response.ok) {
      const parsed = apiErrorResponseSchema.safeParse(raw)
      throw parsed.success ? new ServerApiError(parsed.data.error.code, parsed.data.error.message)
        : new ServerApiError('HTTP_ERROR', '无法读取或保存服务端记录，请重试。')
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new ServerApiError('INVALID_RESPONSE', '服务端记录未通过校验，没有使用本地数据冒充保存成功。')
    return parsed.data.data
  } catch (failure) {
    if (failure instanceof ServerApiError) throw failure
    throw new ServerApiError(controller.signal.aborted ? 'REQUEST_CANCELLED' : 'NETWORK_ERROR',
      controller.signal.aborted
        ? '请求已停止或超时，服务端可能已保存。请刷新核对，或安全重试原操作。'
        : '无法连接记录服务，输入已保留。请启动后端或检查网络后重试。')
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancel)
  }
}
