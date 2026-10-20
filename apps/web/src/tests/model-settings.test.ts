import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicModelSettings, ModelConnectionResult } from '@defense/shared'
import { useModelSettings } from '../composables/useModelSettings'
import {
  getModelSettings,
  saveModelSettings,
  testModelConnection,
  listAvailableModels,
} from '../services/model-settings-api'

vi.mock('../services/model-settings-api', () => ({
  getModelSettings: vi.fn(),
  saveModelSettings: vi.fn(),
  testModelConnection: vi.fn(),
  listAvailableModels: vi.fn(),
}))
const initial: PublicModelSettings = {
  baseUrl: 'https://fixture.invalid/v1',
  model: 'fixture-model',
  timeoutMs: 45000,
  responseFormat: 'json_schema',
  hasApiKey: true,
  source: 'saved',
  status: 'configured',
  updatedAt: '2026-10-20T10:00:00.000Z',
}
const connection: ModelConnectionResult = {
  model: 'fixture-model',
  latencyMs: 80,
  responseFormat: 'json_schema',
}
const scopes: ReturnType<typeof effectScope>[] = []
function setup() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useModelSettings())!
}
beforeEach(() => {
  vi.mocked(getModelSettings).mockReset().mockResolvedValue(initial)
  vi.mocked(saveModelSettings).mockReset().mockResolvedValue(initial)
  vi.mocked(testModelConnection).mockReset().mockResolvedValue(connection)
  vi.mocked(listAvailableModels)
    .mockReset()
    .mockResolvedValue({ models: ['fixture-alpha', 'fixture-beta'] })
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.unstubAllGlobals()
})
describe('model settings form state', () => {
  it('fetches without a model name and allows choosing a returned model before saving', async () => {
    const settings = setup()
    await settings.run('loading')
    settings.form.model = ''
    await settings.run('listing')
    expect(settings.models.value).toEqual(['fixture-alpha', 'fixture-beta'])
    expect(settings.form.model).toBe('')
    expect(vi.mocked(listAvailableModels).mock.calls[0]![0]).not.toHaveProperty('model')
    settings.form.model = settings.models.value[1]!
    await settings.run('saving')
    expect(vi.mocked(saveModelSettings).mock.calls[0]![0].model).toBe('fixture-beta')
  })
  it('invalidates old lists on URL or key changes and retains a manually entered model', async () => {
    const settings = setup()
    await settings.run('loading')
    await settings.run('listing')
    settings.form.model = 'manually-entered-model'
    settings.manualModel.value = true
    expect(settings.models.value).toHaveLength(2)
    settings.form.baseUrl = 'https://another.invalid/v1'
    expect(settings.models.value).toEqual([])
    expect(settings.modelsLoaded.value).toBe(false)
    expect(settings.form.model).toBe('manually-entered-model')
    settings.form.apiKey = 'new-fixture-key'
    await settings.run('listing')
    settings.form.apiKey = 'different-fixture-key'
    expect(settings.models.value).toEqual([])
  })
  it('shows empty-list and failed-fetch states without replacing user input', async () => {
    const settings = setup()
    await settings.run('loading')
    vi.mocked(listAvailableModels).mockResolvedValueOnce({ models: [] })
    await settings.run('listing')
    expect(settings.modelsLoaded.value).toBe(true)
    expect(settings.message.value).toContain('列表为空')
    vi.mocked(listAvailableModels).mockRejectedValueOnce(new Error('列表接口不可用'))
    await settings.run('listing')
    expect(settings.error.value).toBe('列表接口不可用')
    expect(settings.modelsLoaded.value).toBe(false)
    expect(settings.form.model).toBe(initial.model)
  })
  it('blocks duplicate fetches and discards results for edited credentials', async () => {
    const settings = setup()
    await settings.run('loading')
    let resolve!: (value: { models: string[] }) => void
    vi.mocked(listAvailableModels).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = settings.run('listing')
    await settings.run('listing')
    expect(listAvailableModels).toHaveBeenCalledTimes(1)
    settings.form.apiKey = 'changed-key'
    resolve({ models: ['stale-model'] })
    await pending
    expect(settings.models.value).toEqual([])
    expect(settings.modelsLoaded.value).toBe(false)
  })
  it('loads safe settings with an empty password field and blocks missing model or initial key', async () => {
    const settings = setup()
    await settings.run('loading')
    expect(settings.form.apiKey).toBe('')
    expect(settings.saved.value?.hasApiKey).toBe(true)
    settings.form.model = ' '
    await settings.run('saving')
    expect(settings.errors.value.model).toBeTruthy()
    expect(saveModelSettings).not.toHaveBeenCalled()
    vi.mocked(getModelSettings).mockResolvedValueOnce({ ...initial, hasApiKey: false })
    await settings.run('loading')
    await settings.run('testing')
    expect(settings.errors.value.apiKey).toBeTruthy()
    expect(testModelConnection).not.toHaveBeenCalled()
  })
  it('tests unsaved values, invalidates stale success on edits, then saves and clears the key', async () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    const settings = setup()
    await settings.run('loading')
    settings.form.apiKey = 'new-fixture-secret'
    await settings.run('testing')
    expect(settings.connection.value).toEqual(connection)
    expect(saveModelSettings).not.toHaveBeenCalled()
    settings.form.model = 'another-model'
    expect(settings.connection.value).toBeNull()
    expect(settings.message.value).toBe('')
    await settings.run('saving')
    expect(settings.form.apiKey).toBe('')
    expect(settings.message.value).toContain('已保存到后端')
    expect(setItem).not.toHaveBeenCalled()
  })
  it('requires reentry when the destination changes', async () => {
    const settings = setup()
    await settings.run('loading')
    settings.form.baseUrl = 'https://another.invalid/v1'
    await settings.run('testing')
    expect(settings.errors.value.apiKey).toContain('更换 API 地址')
    expect(testModelConnection).not.toHaveBeenCalled()
    settings.form.apiKey = 'new-fixture-key'
    await settings.run('testing')
    expect(testModelConnection).toHaveBeenCalledTimes(1)
  })
  it('prevents concurrent requests and preserves input on a connection error', async () => {
    const settings = setup()
    await settings.run('loading')
    settings.form.apiKey = 'keep-this-fixture-key'
    let reject!: (error: Error) => void
    vi.mocked(testModelConnection).mockImplementationOnce(
      () =>
        new Promise((_done, fail) => {
          reject = fail
        }),
    )
    const pending = settings.run('testing')
    await settings.run('testing')
    await settings.run('saving')
    expect(testModelConnection).toHaveBeenCalledTimes(1)
    expect(saveModelSettings).not.toHaveBeenCalled()
    reject(new Error('认证失败'))
    await pending
    expect(settings.form.apiKey).toBe('keep-this-fixture-key')
    expect(settings.error.value).toBe('认证失败')
    expect(settings.connection.value).toBeNull()
  })
  it('never claims save success when persistence fails', async () => {
    const settings = setup()
    await settings.run('loading')
    settings.form.model = 'changed-model'
    settings.form.apiKey = 'retain-fixture-secret'
    vi.mocked(saveModelSettings).mockRejectedValueOnce(new Error('保存失败'))
    await settings.run('saving')
    expect(settings.error.value).toBe('保存失败')
    expect(settings.message.value).toBe('')
    expect(settings.form.model).toBe('changed-model')
    expect(settings.form.apiKey).toBe('retain-fixture-secret')
    expect(settings.saved.value?.model).toBe(initial.model)
  })
  it('clears keys and ignores late responses when the view closes', async () => {
    const settings = setup()
    await settings.run('loading')
    let resolve!: (value: ModelConnectionResult) => void
    settings.form.apiKey = 'ephemeral-fixture-key'
    vi.mocked(testModelConnection).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = settings.run('testing')
    const signal = vi.mocked(testModelConnection).mock.calls[0]![1]!
    settings.dispose()
    resolve(connection)
    await pending
    expect(signal.aborted).toBe(true)
    expect(settings.form.apiKey).toBe('')
    expect(settings.connection.value).toBeNull()
  })
})
