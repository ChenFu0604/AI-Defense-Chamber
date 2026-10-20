import { z } from 'zod'
import { readBoundedResponse } from './ai-client.js'
import { AppError } from '../middleware/app-error.js'
import { modelTransport, modelConnectionHint } from './model-transport.js'

const upstreamModelsSchema = z.object({
  data: z.array(z.object({ id: z.string().trim().min(1).max(200) })).max(5000),
})
export async function fetchModelList(
  config: { baseUrl: string; apiKey: string; timeoutMs: number },
  transport: typeof fetch = modelTransport.fetch,
  signal?: AbortSignal,
) {
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, config.timeoutMs)
  try {
    controller.signal.throwIfAborted()
    const response = await transport(config.baseUrl + '/models', {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: 'Bearer ' + config.apiKey, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      await response.body?.cancel()
      if ([401, 403].includes(response.status))
        throw new AppError(
          502,
          'AI_AUTH_ERROR',
          '获取模型列表时认证失败，请检查密钥及模型列表访问权限。',
        )
      if (response.status === 429)
        throw new AppError(429, 'AI_RATE_LIMITED', '模型列表请求被限流，请稍后重试。')
      if ([404, 405, 501].includes(response.status))
        throw new AppError(
          502,
          'MODEL_LIST_UNSUPPORTED',
          '该服务不支持获取模型列表，请确认 Base URL 或手动填写模型 ID。',
        )
      throw new AppError(
        502,
        'MODEL_LIST_UNAVAILABLE',
        '获取模型列表失败，请检查服务地址或稍后重试，也可手动填写模型 ID。',
      )
    }
    let raw: unknown
    try {
      raw = JSON.parse(await readBoundedResponse(response))
    } catch (failure) {
      if (failure instanceof AppError || controller.signal.aborted) throw failure
      throw new AppError(
        502,
        'MODEL_LIST_INVALID_OUTPUT',
        '服务返回的模型列表不是有效 JSON，可手动填写模型 ID。',
      )
    }
    controller.signal.throwIfAborted()
    const parsed = upstreamModelsSchema.safeParse(raw)
    if (!parsed.success)
      throw new AppError(
        502,
        'MODEL_LIST_INVALID_OUTPUT',
        '模型列表格式不符合 OpenAI 兼容协议，可手动填写模型 ID。',
      )
    return {
      models: [...new Set(parsed.data.data.map((item) => item.id))].sort((a, b) =>
        a.localeCompare(b),
      ),
    }
  } catch (failure) {
    if (controller.signal.aborted)
      throw new AppError(
        timedOut ? 504 : 499,
        timedOut ? 'AI_TIMEOUT' : 'REQUEST_CANCELLED',
        timedOut ? '获取模型列表超时，请稍后重试或手动填写模型 ID。' : '模型列表请求已取消。',
      )
    if (failure instanceof AppError) throw failure
    throw new AppError(
      502,
      'MODEL_LIST_CONNECTION_FAILED',
      '无法连接模型列表服务。' + modelConnectionHint(failure) + '也可手动填写模型 ID。',
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
