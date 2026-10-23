import { z } from 'zod'
import type { EmbeddingConfig } from '../config/embedding.js'
import { AppError } from '../middleware/app-error.js'
import { modelTransport, modelConnectionHint } from './model-transport.js'

export interface EmbeddingClient {
  embed(input: string[], config: EmbeddingConfig, signal?: AbortSignal): Promise<{ vectors: number[][]; model: string }>
}
const responseSchema = z.object({
  model: z.string().trim().min(1).max(200),
  data: z.array(z.object({
    index: z.number().int().min(0).max(31),
    embedding: z.array(z.number().finite()).min(1).max(4096),
  })).min(1).max(32),
})
const invalid = () => new AppError(502, 'EMBEDDING_INVALID_OUTPUT', 'Embedding 服务返回的向量格式无效，请检查模型是否支持 /embeddings。')
async function readResponse(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader()
  if (!reader) throw invalid()
  const chunks: Uint8Array[] = []
  let size = 0
  const cancel = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    signal.throwIfAborted()
    while (true) {
      const part = await reader.read()
      signal.throwIfAborted()
      if (part.done) break
      size += part.value.byteLength
      if (size > 8 * 1024 * 1024) {
        await reader.cancel()
        throw invalid()
      }
      chunks.push(part.value)
    }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock() }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw invalid() }
}
export function createEmbeddingClient(transport: typeof fetch = modelTransport.fetch): EmbeddingClient {
  return {
    async embed(input, config, signal) {
      if (!input.length || input.length > 32 || input.some((text) => !text.trim() || text.length > 900))
        throw new AppError(400, 'EMBEDDING_INPUT_INVALID', 'Embedding 请求需包含 1～32 段非空文本，每段不超过 900 字符。')
      const controller = new AbortController()
      let timedOut = false
      const cancel = () => controller.abort()
      if (signal?.aborted) controller.abort()
      signal?.addEventListener('abort', cancel, { once: true })
      const timer = setTimeout(() => { timedOut = true; controller.abort() }, config.timeoutMs)
      try {
        controller.signal.throwIfAborted()
        const response = await transport(config.baseUrl.replace(/\/+$/, '') + '/embeddings', {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.model, input, encoding_format: 'float', ...(config.dimensions === null ? {} : { dimensions: config.dimensions }) }),
        })
        if (!response.ok) {
          await response.body?.cancel()
          if ([401, 403].includes(response.status)) throw new AppError(502, 'EMBEDDING_AUTH_ERROR', 'Embedding 服务认证失败，请检查独立配置的密钥和模型权限。')
          if (response.status === 429) throw new AppError(429, 'EMBEDDING_RATE_LIMITED', 'Embedding 服务请求被限流，请稍后重试。')
          throw new AppError(502, 'EMBEDDING_UNAVAILABLE', 'Embedding 服务请求失败，请检查地址和模型是否支持 /embeddings。')
        }
        const parsed = responseSchema.safeParse(await readResponse(response, controller.signal))
        controller.signal.throwIfAborted()
        if (!parsed.success || parsed.data.data.length !== input.length) throw invalid()
        const ordered = [...parsed.data.data].sort((a, b) => a.index - b.index)
        const dimensions = ordered[0]!.embedding.length
        if ((config.dimensions !== null && dimensions !== config.dimensions) || ordered.some((item, index) =>
          item.index !== index || item.embedding.length !== dimensions || !item.embedding.some((value) => value !== 0) || !Number.isFinite(Math.hypot(...item.embedding)))) throw invalid()
        return { vectors: ordered.map((item) => item.embedding), model: parsed.data.model }
      } catch (failure) {
        if (controller.signal.aborted)
          throw new AppError(timedOut ? 504 : 499, timedOut ? 'EMBEDDING_TIMEOUT' : 'REQUEST_CANCELLED', timedOut ? 'Embedding 请求超时，请稍后重试或调整超时设置。' : 'Embedding 请求已取消。')
        if (failure instanceof AppError) throw failure
        throw new AppError(502, 'EMBEDDING_CONNECTION_FAILED', '无法连接 Embedding 服务。' + modelConnectionHint(failure))
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
    },
  }
}
export const embeddingClient = createEmbeddingClient()
