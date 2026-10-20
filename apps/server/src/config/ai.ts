import { z } from 'zod'
import { AppError } from '../middleware/app-error.js'

const configSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_MODEL: z.string().trim().min(1).max(200),
  OPENAI_BASE_URL: z.url().refine((value) => {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  }),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000),
  AI_RESPONSE_FORMAT: z.enum(['json_schema', 'json_object']),
})
export interface AIConfig {
  apiKey: string
  model: string
  baseUrl: string
  timeoutMs: number
  responseFormat: 'json_schema' | 'json_object'
}
export type AIConfigurationStatus = 'configured' | 'not_configured' | 'configuration_error'

export function readAIConfig(source: NodeJS.ProcessEnv = process.env): AIConfig {
  const missing = ['OPENAI_API_KEY', 'OPENAI_MODEL'].filter((name) => !source[name]?.trim())
  if (missing.length)
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      `尚未配置模型 API。请在服务端 apps/server/.env 中填写 ${missing.join('、')} 和 OPENAI_BASE_URL，然后重启后端。`,
    )
  const parsed = configSchema.safeParse({
    OPENAI_API_KEY: source.OPENAI_API_KEY,
    OPENAI_MODEL: source.OPENAI_MODEL,
    OPENAI_BASE_URL: source.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
    AI_TIMEOUT_MS: source.AI_TIMEOUT_MS || '45000',
    AI_RESPONSE_FORMAT: source.AI_RESPONSE_FORMAT || 'json_schema',
  })
  if (!parsed.success)
    throw new AppError(
      503,
      'AI_CONFIG_INVALID',
      '模型配置无效，请检查服务端 OPENAI_BASE_URL、OPENAI_MODEL、AI_TIMEOUT_MS 和 AI_RESPONSE_FORMAT。',
    )
  return {
    apiKey: parsed.data.OPENAI_API_KEY,
    model: parsed.data.OPENAI_MODEL,
    baseUrl: parsed.data.OPENAI_BASE_URL.replace(/\/+$/, ''),
    timeoutMs: parsed.data.AI_TIMEOUT_MS,
    responseFormat: parsed.data.AI_RESPONSE_FORMAT,
  }
}
export function getAIConfigurationStatus(
  source: NodeJS.ProcessEnv = process.env,
): AIConfigurationStatus {
  try {
    readAIConfig(source)
    return 'configured'
  } catch (error) {
    return error instanceof AppError && error.code === 'AI_NOT_CONFIGURED'
      ? 'not_configured'
      : 'configuration_error'
  }
}
