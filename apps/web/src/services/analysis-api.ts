import {
  analysisMatchesProject,
  analysisResponseSchema,
  apiErrorResponseSchema,
  type AnalysisMode,
  type AnalysisRecord,
  type Project,
} from '@defense/shared'

export class AnalysisApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AnalysisApiError'
  }
}
export async function requestProjectAnalysis(
  project: Project,
  mode: AnalysisMode,
  signal?: AbortSignal,
): Promise<AnalysisRecord> {
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 130000)
  try {
    controller.signal.throwIfAborted()
    const response = await fetch('/api/v1/projects/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, mode }),
      signal: controller.signal,
    })
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new AnalysisApiError(
        'INVALID_RESPONSE',
        '分析服务返回格式异常，请确认后端运行正常后重试。',
      )
    }
    if (!response.ok) {
      const parsed = apiErrorResponseSchema.safeParse(body)
      if (parsed.success)
        throw new AnalysisApiError(parsed.data.error.code, parsed.data.error.message)
      throw new AnalysisApiError('HTTP_ERROR', '分析服务暂时不可用，请稍后重试。')
    }
    const parsed = analysisResponseSchema.safeParse(body)
    if (
      !parsed.success ||
      parsed.data.data.mode !== mode ||
      !analysisMatchesProject(parsed.data.data, project)
    )
      throw new AnalysisApiError(
        'INVALID_RESPONSE',
        '分析结果结构、来源或项目资料不一致，未保存此结果，请重试。',
      )
    controller.signal.throwIfAborted()
    return parsed.data.data
  } catch (error) {
    if (controller.signal.aborted)
      throw new AnalysisApiError(
        timedOut ? 'CLIENT_TIMEOUT' : 'REQUEST_CANCELLED',
        timedOut ? '分析请求超时，已有资料和画像已保留，请重试。' : '本次分析已取消。',
      )
    if (error instanceof AnalysisApiError) throw error
    throw new AnalysisApiError(
      'NETWORK_ERROR',
      '无法连接分析服务，请确认后端已启动且网络正常后重试。',
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
