import { healthResponseSchema, type HealthData } from '@defense/shared'

export async function fetchHealth(): Promise<HealthData> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch('/api/v1/health', { signal: controller.signal })
    if (!response.ok) throw new Error('基础服务暂时不可用，请确认后端已启动后重试。')
    const parsed = healthResponseSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error('服务响应格式不正确，请检查服务版本。')
    return parsed.data.data
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new Error('连接超时，请检查后端服务后重试。')
    if (error instanceof TypeError || error instanceof SyntaxError)
      throw new Error('暂时无法连接服务，请确认后端已启动。')
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}
