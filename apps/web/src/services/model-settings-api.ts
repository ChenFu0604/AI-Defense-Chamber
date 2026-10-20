import { MODEL_REQUEST_TIMEOUT_MS } from '@defense/shared'
import {
  apiErrorResponseSchema,
  modelSettingsResponseSchema,
  modelConnectionResponseSchema,
  type ModelSettingsInput,
  type ModelListRequest,
  modelListResponseSchema,
} from '@defense/shared'

async function request(
  path = '',
  method = 'GET',
  body?: ModelSettingsInput | ModelListRequest,
  signal?: AbortSignal,
) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(cancel, MODEL_REQUEST_TIMEOUT_MS)
  try {
    controller.signal.throwIfAborted()
    const response = await fetch('/api/v1/settings/model' + path, {
      method,
      headers: {
        'X-Settings-Request': '1',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new Error('设置接口返回格式异常，请确认后端运行正常。')
    }
    if (!response.ok) {
      const error = apiErrorResponseSchema.safeParse(data)
      throw new Error(error.success ? error.data.error.message : '模型设置请求失败，请重试。')
    }
    return data
  } catch (failure) {
    if (controller.signal.aborted)
      throw new Error(
        signal?.aborted ? '本次设置请求已取消。' : '请求超时，请检查模型服务或稍后重试。',
      )
    if (failure instanceof TypeError) throw new Error('无法连接后端，请检查服务是否已启动。')
    throw failure
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
export async function getModelSettings(signal?: AbortSignal) {
  const result = modelSettingsResponseSchema.safeParse(await request('', 'GET', undefined, signal))
  if (!result.success) throw new Error('后端模型配置格式异常，未使用该结果。')
  return result.data.data
}
export async function saveModelSettings(input: ModelSettingsInput, signal?: AbortSignal) {
  const result = modelSettingsResponseSchema.safeParse(await request('', 'PUT', input, signal))
  if (!result.success) throw new Error('未能确认配置保存结果，请重新读取后端配置。')
  return result.data.data
}
export async function testModelConnection(input: ModelSettingsInput, signal?: AbortSignal) {
  const result = modelConnectionResponseSchema.safeParse(
    await request('/test', 'POST', input, signal),
  )
  if (!result.success) throw new Error('模型测试结果格式无效，不能确认连接成功。')
  return result.data.data
}
export async function listAvailableModels(input: ModelListRequest, signal?: AbortSignal) {
  const result = modelListResponseSchema.safeParse(await request('/models', 'POST', input, signal))
  if (!result.success) throw new Error('模型列表响应格式异常，可重试或手动填写模型 ID。')
  return result.data.data
}
