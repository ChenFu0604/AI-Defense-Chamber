import { mkdir, writeFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  modelSettingsInputSchema,
  savedModelSettingsSchema,
  publicModelSettingsSchema,
  modelApiKeySchema,
  type ModelSettingsInput,
  modelListRequestSchema,
  type ModelListRequest,
} from '@defense/shared'
import { modelSettingsPath, readSavedModelSettings } from '../config/model-settings-file.js'
import { readAIConfig, getAIConfigurationStatus, type AIConfig } from '../config/ai.js'
import { createAIClient } from './ai-client.js'
import { AppError } from '../middleware/app-error.js'
import { fetchModelList } from './model-list-client.js'

export function createModelSettingsService(
  options: { path?: string; source?: NodeJS.ProcessEnv; transport?: typeof fetch } = {},
) {
  const path = options.path ?? modelSettingsPath
  let saving = false
  function current() {
    const saved = readSavedModelSettings(path),
      source = options.source ?? process.env
    if (saved)
      return {
        saved,
        config: saved.config,
        source: 'saved' as const,
        status: 'configured' as const,
      }
    const format =
      source.AI_RESPONSE_FORMAT === 'json_object'
        ? ('json_object' as const)
        : ('json_schema' as const)
    const timeout = Number(source.AI_TIMEOUT_MS || 45000)
    return {
      saved: null,
      config: {
        baseUrl: (source.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(
          /\/+$/,
          '',
        ),
        model: source.OPENAI_MODEL?.trim() || '',
        apiKey: source.OPENAI_API_KEY?.trim() || '',
        timeoutMs:
          Number.isInteger(timeout) && timeout >= 1000 && timeout <= 120000 ? timeout : 45000,
        responseFormat: format,
      },
      source: Object.keys(source).some(
        (key) =>
          [
            'OPENAI_BASE_URL',
            'OPENAI_API_KEY',
            'OPENAI_MODEL',
            'AI_TIMEOUT_MS',
            'AI_RESPONSE_FORMAT',
          ].includes(key) && source[key],
      )
        ? ('environment' as const)
        : ('default' as const),
      status: getAIConfigurationStatus(source),
    }
  }
  function publicConfig() {
    const state = current()
    let baseUrl = 'https://api.openai.com/v1'
    try {
      const url = new URL(state.config.baseUrl)
      if (['http:', 'https:'].includes(url.protocol)) {
        url.username = ''
        url.password = ''
        url.search = ''
        url.hash = ''
        baseUrl = url.toString().replace(/\/+$/, '')
      }
    } catch {
      /* Invalid environment URLs are not echoed into the page. */
    }
    return publicModelSettingsSchema.parse({
      baseUrl,
      model: state.config.model,
      timeoutMs: state.config.timeoutMs,
      responseFormat: state.config.responseFormat,
      hasApiKey: Boolean(state.config.apiKey),
      source: state.source,
      status: state.status,
      updatedAt: state.saved?.updatedAt ?? null,
    })
  }
  function resolveEndpoint(input: ModelListRequest) {
    const parsed = modelListRequestSchema.safeParse(input)
    if (!parsed.success)
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? '模型配置无效。',
      )
    const previous = current().config,
      next = parsed.data
    const baseUrl = next.baseUrl.replace(/\/+$/, '')
    if (!next.apiKey && baseUrl !== previous.baseUrl && previous.apiKey)
      throw new AppError(
        400,
        'API_KEY_REQUIRED',
        '更换 API 地址时请重新输入该地址对应的密钥，原密钥不会自动转发。',
      )
    const apiKey = next.apiKey || previous.apiKey
    if (!apiKey || !modelApiKeySchema.safeParse(apiKey).success)
      throw new AppError(400, 'API_KEY_REQUIRED', '请填写 API 密钥；尚未保存过密钥时不能留空。')
    return { baseUrl, apiKey, timeoutMs: next.timeoutMs }
  }
  function resolve(input: ModelSettingsInput): AIConfig {
    const parsed = modelSettingsInputSchema.safeParse(input)
    if (!parsed.success)
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? '模型配置无效。',
      )
    const next = parsed.data
    const { baseUrl, apiKey } = resolveEndpoint({
      baseUrl: next.baseUrl,
      apiKey: next.apiKey,
      timeoutMs: next.timeoutMs,
    })
    return readAIConfig({
      OPENAI_BASE_URL: baseUrl,
      OPENAI_API_KEY: apiKey,
      OPENAI_MODEL: next.model,
      AI_TIMEOUT_MS: String(next.timeoutMs),
      AI_RESPONSE_FORMAT: next.responseFormat,
    })
  }
  return {
    get: publicConfig,
    async listModels(input: ModelListRequest, signal?: AbortSignal) {
      return fetchModelList(resolveEndpoint(input), options.transport, signal)
    },
    async save(input: ModelSettingsInput) {
      if (saving) throw new AppError(409, 'MODEL_SETTINGS_BUSY', '模型配置正在保存，请稍后重试。')
      saving = true
      const temporary = path + '.' + randomUUID() + '.tmp'
      try {
        const config = resolve(input)
        const record = savedModelSettingsSchema.parse({
          version: 1,
          config,
          updatedAt: new Date().toISOString(),
        })
        await mkdir(dirname(path), { recursive: true })
        await writeFile(temporary, JSON.stringify(record), {
          flag: 'wx',
          encoding: 'utf8',
          mode: 0o600,
        })
        await rename(temporary, path)
        return publicConfig()
      } catch (failure) {
        if (failure instanceof AppError) throw failure
        throw new AppError(
          500,
          'MODEL_SETTINGS_SAVE_FAILED',
          '模型配置保存失败，请检查后端磁盘和文件权限；未确认保存成功。',
        )
      } finally {
        saving = false
        await unlink(temporary).catch(() => undefined)
      }
    },
    async test(input: ModelSettingsInput, signal?: AbortSignal) {
      const config = resolve(input),
        started = Date.now()
      const result = await createAIClient(config, options.transport).generate({
        name: 'model_connection_test',
        schema: z.strictObject({ ok: z.literal(true) }),
        system:
          'This is a connection and structured JSON compatibility test. Return exactly {"ok":true}.',
        user: 'Return the requested JSON object only. No project or personal data is supplied.',
        signal,
      })
      return {
        model: result.model,
        latencyMs: Date.now() - started,
        responseFormat: config.responseFormat,
      }
    },
  }
}
export type ModelSettingsService = ReturnType<typeof createModelSettingsService>
export const modelSettingsService = createModelSettingsService()
