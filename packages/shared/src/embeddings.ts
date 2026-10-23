import { z } from 'zod'
import { modelApiKeySchema, modelBaseUrlSchema, modelTimeoutSchema } from './settings.js'

export const embeddingBaseUrlSchema = modelBaseUrlSchema.refine(
  (value) => {
    try { return !/\/embeddings\/?$/i.test(new URL(value).pathname) }
    catch { return false }
  },
  '请填写 Base URL，不要包含 /embeddings。',
)
const embeddingFields = {
  enabled: z.boolean(),
  baseUrl: embeddingBaseUrlSchema,
  model: z.string().trim().max(200),
  apiKey: modelApiKeySchema.default(''),
  timeoutMs: modelTimeoutSchema,
  dimensions: z.number().int().min(1).max(4096).nullable().default(null),
  minSimilarity: z.number().min(0).max(1).default(0.35),
}
export const embeddingSettingsInputSchema = z.strictObject(embeddingFields).superRefine((value, context) => {
  if (value.enabled && !value.model)
    context.addIssue({ code: 'custom', path: ['model'], message: '启用语义检索时请填写 Embedding 模型名称。' })
})
export type EmbeddingSettingsInput = z.infer<typeof embeddingSettingsInputSchema>
export const savedEmbeddingSettingsSchema = z.strictObject({
  version: z.literal(1),
  updatedAt: z.iso.datetime(),
  config: embeddingSettingsInputSchema.superRefine((value, context) => {
    if (value.enabled && !value.apiKey)
      context.addIssue({ code: 'custom', path: ['apiKey'], message: '启用的 Embedding 配置缺少密钥。' })
  }),
})
export const publicEmbeddingSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  baseUrl: z.string().max(2048),
  model: z.string().max(200),
  timeoutMs: modelTimeoutSchema,
  dimensions: embeddingFields.dimensions,
  minSimilarity: embeddingFields.minSimilarity,
  hasApiKey: z.boolean(),
  source: z.enum(['saved', 'environment', 'default']),
  status: z.enum(['configured', 'not_configured', 'configuration_error']),
  updatedAt: z.iso.datetime().nullable(),
})
export type PublicEmbeddingSettings = z.infer<typeof publicEmbeddingSettingsSchema>
export const embeddingSettingsResponseSchema = z.strictObject({
  success: z.literal(true),
  data: publicEmbeddingSettingsSchema,
})
export const embeddingConnectionResultSchema = z.strictObject({
  model: z.string().trim().min(1).max(200),
  dimensions: z.number().int().min(1).max(4096),
  latencyMs: z.number().nonnegative(),
})
export type EmbeddingConnectionResult = z.infer<typeof embeddingConnectionResultSchema>
export const embeddingConnectionResponseSchema = z.strictObject({
  success: z.literal(true),
  data: embeddingConnectionResultSchema,
})
