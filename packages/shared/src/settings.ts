import { z } from 'zod'

export const DEFAULT_MODEL_TIMEOUT_MS = 120000
export const MAX_MODEL_TIMEOUT_MS = 300000
// Allow the backend deadline and its error response to complete first.
export const MODEL_REQUEST_TIMEOUT_MS = MAX_MODEL_TIMEOUT_MS + 10000
export const modelTimeoutSchema = z.number().int().min(1000).max(MAX_MODEL_TIMEOUT_MS)

export const modelBaseUrlSchema = z
  .string()
  .trim()
  .min(1, '请填写 API Base URL。')
  .max(2048)
  .url('请输入有效的 API 地址。')
  .refine(
    (value) => {
      try {
        const url = new URL(value)
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          !/\/(chat\/completions|models)\/?$/i.test(url.pathname)
        )
      } catch {
        return false
      }
    },
    {
      message:
        '请填写 HTTP(S) Base URL（例如 https://api.openai.com/v1），不要包含认证信息、查询参数或 /chat/completions。',
    },
  )
export const modelApiKeySchema = z
  .string()
  .trim()
  .max(4096)
  .refine((value) => !/[\s\x00-\x1f\x7f]/.test(value), '密钥不能包含空白或控制字符。')
export const modelSettingsInputSchema = z.strictObject({
  baseUrl: modelBaseUrlSchema,
  model: z.string().trim().min(1, '请填写模型名称。').max(200),
  apiKey: modelApiKeySchema.default(''),
  timeoutMs: modelTimeoutSchema,
  responseFormat: z.enum(['json_schema', 'json_object']),
})
export type ModelSettingsInput = z.infer<typeof modelSettingsInputSchema>
export const modelListRequestSchema = modelSettingsInputSchema.pick({
  baseUrl: true,
  apiKey: true,
  timeoutMs: true,
})
export type ModelListRequest = z.infer<typeof modelListRequestSchema>
export const modelListResultSchema = z.strictObject({
  models: z.array(z.string().trim().min(1).max(200)).max(5000),
})
export type ModelListResult = z.infer<typeof modelListResultSchema>
export const modelListResponseSchema = z.strictObject({
  success: z.literal(true),
  data: modelListResultSchema,
})
export const savedModelSettingsSchema = z.strictObject({
  version: z.literal(1),
  updatedAt: z.iso.datetime(),
  config: modelSettingsInputSchema.extend({
    apiKey: modelApiKeySchema.refine((value) => value.length > 0),
  }),
})
export const publicModelSettingsSchema = z.strictObject({
  baseUrl: z.string().max(2048),
  model: z.string().max(200),
  timeoutMs: modelTimeoutSchema,
  responseFormat: z.enum(['json_schema', 'json_object']),
  hasApiKey: z.boolean(),
  source: z.enum(['saved', 'environment', 'default']),
  status: z.enum(['configured', 'not_configured', 'configuration_error']),
  updatedAt: z.iso.datetime().nullable(),
})
export type PublicModelSettings = z.infer<typeof publicModelSettingsSchema>
export const modelSettingsResponseSchema = z.strictObject({
  success: z.literal(true),
  data: publicModelSettingsSchema,
})
export const modelConnectionResultSchema = z.strictObject({
  model: z.string().min(1).max(200),
  latencyMs: z.number().nonnegative(),
  responseFormat: z.enum(['json_schema', 'json_object']),
})
export type ModelConnectionResult = z.infer<typeof modelConnectionResultSchema>
export const modelConnectionResponseSchema = z.strictObject({
  success: z.literal(true),
  data: modelConnectionResultSchema,
})
