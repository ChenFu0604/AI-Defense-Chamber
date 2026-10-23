import {
  MODEL_REQUEST_TIMEOUT_MS,
  apiErrorResponseSchema,
  embeddingSettingsInputSchema,
  embeddingSettingsResponseSchema,
  embeddingConnectionResponseSchema,
  type EmbeddingSettingsInput,
} from '@defense/shared'

async function request(path: string, method: 'GET' | 'PUT' | 'POST', input?: EmbeddingSettingsInput, signal?: AbortSignal) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', cancel, {once: true})
  const timeout = setTimeout(cancel, MODEL_REQUEST_TIMEOUT_MS)
  try {
    controller.signal.throwIfAborted()
    const response = await fetch('/api/v1/settings/embedding' + path, {
      method,
      headers: {'X-Settings-Request': '1', ...(input ? {'Content-Type': 'application/json'} : {})},
      body: input ? JSON.stringify(embeddingSettingsInputSchema.parse(input)) : undefined,
      signal: controller.signal,
    })
    let raw: unknown
    try { raw = await response.json() } catch { throw new Error('向量设置接口返回格式异常，请确认后端已更新。') }
    if (!response.ok) {
      const error = apiErrorResponseSchema.safeParse(raw)
      throw new Error(error.success ? error.data.error.message : '向量模型设置请求失败，请重试。')
    }
    return raw
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? '本次设置请求已取消。' : '向量模型请求超时，请检查服务后重试。')
    if (error instanceof TypeError) throw new Error('无法连接后端，请检查服务是否已启动。')
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}
export async function getEmbeddingSettings(signal?: AbortSignal) {
  const parsed = embeddingSettingsResponseSchema.safeParse(await request('', 'GET', undefined, signal))
  if (!parsed.success) throw new Error('后端向量配置格式异常，未接受该结果。')
  return parsed.data.data
}
export async function saveEmbeddingSettings(input: EmbeddingSettingsInput, signal?: AbortSignal) {
  const parsed = embeddingSettingsResponseSchema.safeParse(await request('', 'PUT', input, signal))
  if (!parsed.success) throw new Error('未能确认向量配置保存结果，请重新读取后端配置。')
  return parsed.data.data
}
export async function testEmbeddingConnection(input: EmbeddingSettingsInput, signal?: AbortSignal) {
  const parsed = embeddingConnectionResponseSchema.safeParse(await request('/test', 'POST', input, signal))
  if (!parsed.success) throw new Error('向量测试响应无效，不能确认连接成功。')
  return parsed.data.data
}
