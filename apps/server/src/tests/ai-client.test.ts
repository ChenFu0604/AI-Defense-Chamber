import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  analysisOutputSchema,
  DEFAULT_MODEL_TIMEOUT_MS,
  MAX_MODEL_TIMEOUT_MS,
} from '@defense/shared'
import { createAIClient } from '../services/ai-client.js'
import { readAIConfig, getAIConfigurationStatus, type AIConfig } from '../config/ai.js'
import { validAnalysisOutput } from '../../../../tests/fixtures/analysis.js'

const config: AIConfig = {
  apiKey: 'test-secret-never-expose',
  model: 'test-model',
  baseUrl: 'https://example.test/v1',
  timeoutMs: 2000,
  responseFormat: 'json_schema',
}
const task = () => ({
  name: 'project_analysis',
  system: 'Analyze JSON only.',
  user: 'Sample project data',
  schema: analysisOutputSchema,
})
const completion = (content: unknown, extra = {}) =>
  new Response(
    JSON.stringify({
      model: 'actual-test-model',
      choices: [
        {
          message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
          finish_reason: 'stop',
          ...extra,
        },
      ],
    }),
    { headers: { 'content-type': 'application/json' } },
  )
afterEach(() => vi.useRealTimers())

describe('AI configuration', () => {
  it('reports missing configuration without including secret values', () => {
    expect(() => readAIConfig({})).toThrow('OPENAI_API_KEY')
    expect(getAIConfigurationStatus({})).toBe('not_configured')
  })
  it('accepts explicit model configuration and local compatible endpoints', () => {
    const parsed = readAIConfig({
      OPENAI_API_KEY: ' test-key ',
      OPENAI_MODEL: ' local-model ',
      OPENAI_BASE_URL: 'http://127.0.0.1:11434/v1/',
      AI_RESPONSE_FORMAT: 'json_object',
    })
    expect(parsed).toMatchObject({
      apiKey: 'test-key',
      model: 'local-model',
      baseUrl: 'http://127.0.0.1:11434/v1',
      responseFormat: 'json_object',
      timeoutMs: DEFAULT_MODEL_TIMEOUT_MS,
    })
  })
  it('accepts the extended environment deadline and rejects an out-of-range value', () => {
    const source = { OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'model' }
    expect(readAIConfig({ ...source, AI_TIMEOUT_MS: String(MAX_MODEL_TIMEOUT_MS) }).timeoutMs).toBe(
      MAX_MODEL_TIMEOUT_MS,
    )
    expect(() =>
      readAIConfig({ ...source, AI_TIMEOUT_MS: String(MAX_MODEL_TIMEOUT_MS + 1) }),
    ).toThrow('模型配置无效')
  })
  it.each([
    { OPENAI_BASE_URL: 'ftp://example.test' },
    { OPENAI_BASE_URL: 'https://user:pass@example.test/v1' },
    { AI_TIMEOUT_MS: 'invalid' },
    { AI_RESPONSE_FORMAT: 'raw' },
  ])('rejects invalid settings', (override) => {
    expect(() =>
      readAIConfig({ OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'model', ...override }),
    ).toThrow('模型配置无效')
  })
})

describe('unified structured AI transport', () => {
  it('sends a server-side credential and strict JSON schema, and validates the response', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(completion(validAnalysisOutput()))
    const result = await createAIClient(config, transport).generate(task())
    expect(result.data).toEqual(validAnalysisOutput())
    expect(result.model).toBe('actual-test-model')
    const [url, options] = transport.mock.calls[0]!
    expect(url).toBe('https://example.test/v1/chat/completions')
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer test-secret-never-expose' })
    const body = JSON.parse(String(options?.body))
    expect(body.response_format.json_schema.strict).toBe(true)
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false)
    expect(body.messages).toHaveLength(2)
    expect(body).not.toHaveProperty('apiKey')
    expect(options?.redirect).toBe('error')
  })
  it('supplies the schema as instructions in JSON-object compatibility mode', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(completion(validAnalysisOutput()))
    await createAIClient({ ...config, responseFormat: 'json_object' }, transport).generate(task())
    const body = JSON.parse(String(transport.mock.calls[0]![1]?.body))
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0].content).toContain('JSON Schema')
  })
  it.each([401, 403, 429, 400, 404, 503])(
    'maps upstream HTTP %s without echoing provider content',
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('sensitive-provider-body', { status }))
      const promise = createAIClient(config, transport).generate(task())
      await expect(promise).rejects.not.toThrow('sensitive-provider-body')
    },
  )
  it.each(['not-json', JSON.stringify({}), JSON.stringify({ choices: [] })])(
    'rejects invalid protocol responses',
    async (body) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(body))
      await expect(createAIClient(config, transport).generate(task())).rejects.toMatchObject({
        code: 'AI_INVALID_OUTPUT',
      })
    },
  )
  it.each(['not JSON', JSON.stringify({ coreValue: 'wrong type' })])(
    'rejects malformed model content',
    async (content) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(completion(content))
      await expect(createAIClient(config, transport).generate(task())).rejects.toMatchObject({
        code: 'AI_INVALID_OUTPUT',
      })
    },
  )
  it('does not accept incomplete model output', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(completion(validAnalysisOutput(), { finish_reason: 'length' }))
    await expect(createAIClient(config, transport).generate(task())).rejects.toMatchObject({
      code: 'AI_INCOMPLETE_OUTPUT',
    })
  })
  it('handles model refusals explicitly', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(completion('', { message: { refusal: 'refused', content: null } }))
    await expect(createAIClient(config, transport).generate(task())).rejects.toMatchObject({
      code: 'AI_REFUSED',
    })
  })
  it('sanitizes network errors', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('test-secret-never-expose'))
    await expect(createAIClient(config, transport).generate(task())).rejects.toMatchObject({
      code: 'AI_CONNECTION_FAILED',
    })
  })
  it('aborts timed-out requests and returns a specific error', async () => {
    vi.useFakeTimers()
    const transport = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    const pending = createAIClient({ ...config, timeoutMs: 180000 }, transport).generate(task())
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
      status: 504,
      message: expect.stringContaining('180 秒'),
    })
    await vi.advanceTimersByTimeAsync(130000)
    expect(transport.mock.calls[0]![1]!.signal!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(50000)
    await assertion
    expect(transport.mock.calls[0]![1]!.signal!.aborted).toBe(true)
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('accepts a valid model response taking longer than the old 45 second default', async () => {
    vi.useFakeTimers()
    const transport = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(completion(validAnalysisOutput())), 90000)
        }),
    )
    const pending = createAIClient(
      { ...config, timeoutMs: DEFAULT_MODEL_TIMEOUT_MS },
      transport,
    ).generate(task())
    await vi.advanceTimersByTimeAsync(90000)
    expect((await pending).data).toEqual(validAnalysisOutput())
    expect(transport.mock.calls[0]![1]!.signal!.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not call the provider when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const transport = vi.fn<typeof fetch>()
    await expect(
      createAIClient(config, transport).generate({ ...task(), signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' })
    expect(transport).not.toHaveBeenCalled()
  })
  it('rejects oversized provider responses', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('x'.repeat(512 * 1024 + 1)))
    await expect(createAIClient(config, transport).generate(task())).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
    })
  })
})
