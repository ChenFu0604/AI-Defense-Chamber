import { z } from 'zod'
import { readAIConfig, type AIConfig } from '../config/ai.js'
import { AppError } from '../middleware/app-error.js'

export interface StructuredAITask<T> {
  system: string
  user: string
  name: string
  schema: z.ZodType<T>
  signal?: AbortSignal
}
export interface AIClient {
  generate<T>(task: StructuredAITask<T>): Promise<{ data: T; model: string }>
}

const completionSchema = z.object({
  model: z.string().trim().min(1).max(200).optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
})
const MAX_RESPONSE_BYTES = 512 * 1024

async function readBoundedResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new AppError(502, 'AI_INVALID_OUTPUT', '模型返回了空响应，请重试。')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new AppError(502, 'AI_INVALID_OUTPUT', '模型响应过大，请缩短资料或稍后重试。')
      }
      chunks.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function createAIClient(config: AIConfig, transport: typeof fetch = fetch): AIClient {
  return {
    async generate<T>(task: StructuredAITask<T>) {
      const controller = new AbortController()
      let timedOut = false
      const onCancel = () => controller.abort()
      if (task.signal?.aborted) controller.abort()
      task.signal?.addEventListener('abort', onCancel, { once: true })
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, config.timeoutMs)
      try {
        const jsonSchema = z.toJSONSchema(task.schema, { target: 'draft-7' })
        delete jsonSchema.$schema
        controller.signal.throwIfAborted()
        const response = await transport(config.baseUrl + '/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          redirect: 'error',
          headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.model,
            stream: false,
            messages: [
              {
                role: 'system',
                content:
                  task.system +
                  (config.responseFormat === 'json_object'
                    ? '\nJSON Schema:\n' + JSON.stringify(jsonSchema)
                    : ''),
              },
              { role: 'user', content: task.user },
            ],
            response_format:
              config.responseFormat === 'json_schema'
                ? {
                    type: 'json_schema',
                    json_schema: { name: task.name, strict: true, schema: jsonSchema },
                  }
                : { type: 'json_object' },
          }),
        })
        controller.signal.throwIfAborted()
        if (!response.ok) {
          await response.body?.cancel()
          if ([401, 403].includes(response.status))
            throw new AppError(
              502,
              'AI_AUTH_ERROR',
              '模型认证失败或没有使用权限，请检查服务端密钥和模型权限。',
            )
          if (response.status === 429)
            throw new AppError(
              429,
              'AI_RATE_LIMITED',
              '模型服务当前限流或额度不足，请稍后重试或检查服务商额度。',
            )
          if (response.status === 400)
            throw new AppError(
              502,
              'AI_REQUEST_REJECTED',
              '模型服务拒绝了请求，请检查模型名称与结构化输出支持情况；兼容服务可在后端设置 AI_RESPONSE_FORMAT=json_object 后重试。',
            )
          throw new AppError(
            502,
            'AI_UNAVAILABLE',
            '模型服务暂时不可用，请检查模型名称、服务地址或稍后重试。',
          )
        }
        let raw: unknown
        try {
          raw = JSON.parse(await readBoundedResponse(response))
        } catch (error) {
          if (error instanceof AppError || controller.signal.aborted) throw error
          throw new AppError(
            502,
            'AI_INVALID_OUTPUT',
            '模型返回格式异常，未生成有效项目画像，请重试。',
          )
        }
        const completion = completionSchema.safeParse(raw)
        if (!completion.success)
          throw new AppError(
            502,
            'AI_INVALID_OUTPUT',
            '模型服务响应缺少必要字段，请检查接口兼容性或重试。',
          )
        const choice = completion.data.choices[0]!
        if (choice.message.refusal || choice.finish_reason === 'content_filter')
          throw new AppError(422, 'AI_REFUSED', '模型未能分析这份资料。请检查内容，调整后重试。')
        if (choice.finish_reason === 'length')
          throw new AppError(
            502,
            'AI_INCOMPLETE_OUTPUT',
            '模型输出被截断，未保存为有效画像，请缩短资料或更换模型后重试。',
          )
        let content: unknown
        try {
          content = JSON.parse(choice.message.content ?? '')
        } catch {
          throw new AppError(
            502,
            'AI_INVALID_OUTPUT',
            '模型输出不是有效的 JSON，未生成项目画像，请重试。',
          )
        }
        controller.signal.throwIfAborted()
        const parsed = task.schema.safeParse(content)
        if (!parsed.success)
          throw new AppError(
            502,
            'AI_INVALID_OUTPUT',
            '模型输出不符合项目画像结构，未保存分析结果，请重试。',
          )
        return { data: parsed.data, model: completion.data.model ?? config.model }
      } catch (error) {
        if (controller.signal.aborted)
          throw new AppError(
            timedOut ? 504 : 499,
            timedOut ? 'AI_TIMEOUT' : 'REQUEST_CANCELLED',
            timedOut ? '模型分析超时，原项目资料和已有画像已保留，请重试。' : '本次分析已取消。',
          )
        if (error instanceof AppError) throw error
        throw new AppError(
          502,
          'AI_CONNECTION_FAILED',
          '无法连接模型服务，请检查后端网络和服务地址后重试。',
        )
      } finally {
        clearTimeout(timer)
        task.signal?.removeEventListener('abort', onCancel)
      }
    },
  }
}

export const aiClient: AIClient = {
  generate: (task) => createAIClient(readAIConfig()).generate(task),
}
