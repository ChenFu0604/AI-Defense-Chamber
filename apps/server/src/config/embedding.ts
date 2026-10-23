import { DEFAULT_MODEL_TIMEOUT_MS, embeddingSettingsInputSchema, modelApiKeySchema } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'
import { readSavedEmbeddingSettings } from './embedding-settings-file.js'

export interface EmbeddingConfig {
  enabled: true
  baseUrl: string
  model: string
  apiKey: string
  timeoutMs: number
  dimensions: number | null
  minSimilarity: number
}
export function embeddingEnvironment(source: NodeJS.ProcessEnv) {
  return {
    enabled: source.EMBEDDING_ENABLED?.trim() === 'true',
    baseUrl: source.EMBEDDING_BASE_URL?.trim() || 'https://api.openai.com/v1',
    model: source.EMBEDDING_MODEL?.trim() || '',
    apiKey: source.EMBEDDING_API_KEY?.trim() || '',
    timeoutMs: Number(source.EMBEDDING_TIMEOUT_MS || DEFAULT_MODEL_TIMEOUT_MS),
    dimensions: source.EMBEDDING_DIMENSIONS?.trim() ? Number(source.EMBEDDING_DIMENSIONS) : null,
    minSimilarity: Number(source.EMBEDDING_MIN_SIMILARITY || '0.35'),
  }
}
export function readEmbeddingConfig(source?: NodeJS.ProcessEnv, savedPath?: string): EmbeddingConfig {
  const saved = source === undefined ? readSavedEmbeddingSettings(savedPath) : null
  const value = saved?.config ?? embeddingEnvironment(source ?? process.env)
  if (!value.enabled)
    throw new AppError(503, 'EMBEDDING_NOT_CONFIGURED', '向量语义检索尚未启用，请在“系统设置 → Embedding 配置”单独配置模型并保存。关键词检索仍可使用。')
  if (!value.model || !value.apiKey)
    throw new AppError(503, 'EMBEDDING_CONFIG_INVALID', '已启用语义检索，但 Embedding 模型或密钥缺失，请在系统设置中填写并保存；聊天模型配置不会自动用于向量检索。')
  const parsed = embeddingSettingsInputSchema.safeParse(value)
  if (!parsed.success || !modelApiKeySchema.safeParse(value.apiKey).success)
    throw new AppError(503, 'EMBEDDING_CONFIG_INVALID', 'Embedding 配置无效，请检查 API 地址、模型、超时、维度和相似度阈值。')
  return { ...parsed.data, enabled: true, baseUrl: parsed.data.baseUrl.replace(/\/+$/, '') }
}
