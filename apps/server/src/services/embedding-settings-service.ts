import { mkdir, writeFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_MODEL_TIMEOUT_MS, embeddingSettingsInputSchema, publicEmbeddingSettingsSchema,
  savedEmbeddingSettingsSchema, modelTimeoutSchema, type EmbeddingSettingsInput,
} from '@defense/shared'
import { embeddingSettingsPath, readSavedEmbeddingSettings } from '../config/embedding-settings-file.js'
import { embeddingEnvironment, type EmbeddingConfig } from '../config/embedding.js'
import { createEmbeddingClient } from './embedding-client.js'
import { AppError } from '../middleware/app-error.js'

export function createEmbeddingSettingsService(options: { path?: string; source?: NodeJS.ProcessEnv; transport?: typeof fetch } = {}) {
  const path = options.path ?? embeddingSettingsPath
  let saving = false
  function current() {
    const saved = readSavedEmbeddingSettings(path)
    const source = options.source ?? process.env
    const config = saved?.config ?? embeddingEnvironment(source)
    const parsed = embeddingSettingsInputSchema.safeParse(config)
    return {
      saved, config,
      source: saved ? 'saved' as const : Object.keys(source).some((key) => key.startsWith('EMBEDDING_') && source[key]) ? 'environment' as const : 'default' as const,
      status: !parsed.success || (config.enabled && !config.apiKey) ? 'configuration_error' as const : config.enabled ? 'configured' as const : 'not_configured' as const,
    }
  }
  function publicConfig() {
    const state = current()
    let baseUrl = 'https://api.openai.com/v1'
    try {
      const url = new URL(state.config.baseUrl)
      if (['http:', 'https:'].includes(url.protocol)) {
        url.username = ''; url.password = ''; url.search = ''; url.hash = ''
        baseUrl = url.toString().replace(/\/+$/, '')
      }
    } catch { /* Never echo credentials embedded in an invalid environment URL. */ }
    const timeout = modelTimeoutSchema.safeParse(state.config.timeoutMs)
    return publicEmbeddingSettingsSchema.parse({
      enabled: state.config.enabled, baseUrl, model: state.config.model.slice(0, 200),
      timeoutMs: timeout.success ? timeout.data : DEFAULT_MODEL_TIMEOUT_MS,
      dimensions: Number.isInteger(state.config.dimensions) && state.config.dimensions! >= 1 && state.config.dimensions! <= 4096 ? state.config.dimensions : null,
      minSimilarity: Number.isFinite(state.config.minSimilarity) && state.config.minSimilarity >= 0 && state.config.minSimilarity <= 1 ? state.config.minSimilarity : 0.35,
      hasApiKey: Boolean(state.config.apiKey), source: state.source, status: state.status,
      updatedAt: state.saved?.updatedAt ?? null,
    })
  }
  function resolve(input: EmbeddingSettingsInput, forTest = false) {
    const parsed = embeddingSettingsInputSchema.safeParse(forTest ? { ...input, enabled: true } : input)
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Embedding 配置无效。')
    const previous = current().config
    const next = parsed.data
    const baseUrl = next.baseUrl.replace(/\/+$/, '')
    const changed = baseUrl !== previous.baseUrl.replace(/\/+$/, '')
    if (next.enabled && changed && !next.apiKey && previous.apiKey)
      throw new AppError(400, 'API_KEY_REQUIRED', '更换 Embedding API 地址时请重新输入对应密钥，原密钥不会转发到新地址。')
    const apiKey = next.apiKey || (changed ? '' : previous.apiKey)
    if (next.enabled && !apiKey)
      throw new AppError(400, 'API_KEY_REQUIRED', '请填写 Embedding API 密钥；聊天模型的密钥不会自动复用。')
    const config = { ...next, baseUrl, apiKey }
    if (!savedEmbeddingSettingsSchema.safeParse({version: 1, config, updatedAt: new Date().toISOString()}).success)
      throw new AppError(400, 'VALIDATION_ERROR', 'Embedding 配置无效，请重新填写。')
    return config
  }
  return {
    get: publicConfig,
    async save(input: EmbeddingSettingsInput) {
      if (saving) throw new AppError(409, 'EMBEDDING_SETTINGS_BUSY', 'Embedding 配置正在保存，请稍后重试。')
      saving = true
      const temporary = path + '.' + randomUUID() + '.tmp'
      try {
        const config = resolve(input)
        const record = savedEmbeddingSettingsSchema.parse({ version: 1, config, updatedAt: new Date().toISOString() })
        await mkdir(dirname(path), { recursive: true })
        await writeFile(temporary, JSON.stringify(record), { flag: 'wx', encoding: 'utf8', mode: 0o600 })
        await rename(temporary, path)
        const confirmed = readSavedEmbeddingSettings(path)
        if (!confirmed || JSON.stringify(confirmed) !== JSON.stringify(record))
          throw new AppError(500, 'EMBEDDING_SETTINGS_SAVE_FAILED', '无法确认 Embedding 配置已完整保存，请检查磁盘和文件权限。')
        return publicConfig()
      } catch (failure) {
        if (failure instanceof AppError) throw failure
        throw new AppError(500, 'EMBEDDING_SETTINGS_SAVE_FAILED', 'Embedding 配置保存失败，请检查磁盘和文件权限；未确认保存成功。')
      } finally { saving = false; await unlink(temporary).catch(() => undefined) }
    },
    async test(input: EmbeddingSettingsInput, signal?: AbortSignal) {
      const config = resolve(input, true) as EmbeddingConfig
      const started = Date.now()
      const result = await createEmbeddingClient(options.transport).embed(['连接测试：验证文本向量接口，不含项目资料。'], config, signal)
      return { model: result.model, dimensions: result.vectors[0]!.length, latencyMs: Date.now() - started }
    },
  }
}
export type EmbeddingSettingsService = ReturnType<typeof createEmbeddingSettingsService>
export const embeddingSettingsService = createEmbeddingSettingsService()
