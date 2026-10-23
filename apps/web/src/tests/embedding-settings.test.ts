import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicEmbeddingSettings } from '@defense/shared'
import { useEmbeddingSettings } from '../composables/useEmbeddingSettings'
import { getEmbeddingSettings, saveEmbeddingSettings, testEmbeddingConnection } from '../services/embedding-settings-api'

vi.mock('../services/embedding-settings-api', () => ({getEmbeddingSettings: vi.fn(), saveEmbeddingSettings: vi.fn(), testEmbeddingConnection: vi.fn()}))
const initial: PublicEmbeddingSettings = {enabled: true, baseUrl: 'https://fixture.invalid/v1', model: 'embedding-fixture', timeoutMs: 45000, dimensions: null, minSimilarity: 0.35, hasApiKey: true, source: 'saved', status: 'configured', updatedAt: '2026-10-24T01:00:00.000Z'}
const connection = {model: initial.model, dimensions: 3, latencyMs: 8}
const scopes: ReturnType<typeof effectScope>[] = []
function setup() { const scope = effectScope(); scopes.push(scope); return {scope, ui: scope.run(useEmbeddingSettings)!} }
beforeEach(() => {
  vi.mocked(getEmbeddingSettings).mockReset().mockResolvedValue({...initial})
  vi.mocked(saveEmbeddingSettings).mockReset().mockResolvedValue({...initial})
  vi.mocked(testEmbeddingConnection).mockReset().mockResolvedValue({...connection})
})
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals() })
describe('embedding settings state', () => {
  it('allows saving a disabled configuration without requiring model credentials', async () => {
    vi.mocked(getEmbeddingSettings).mockResolvedValueOnce({...initial, enabled: false, model: '', hasApiKey: false, status: 'not_configured'})
    const {ui} = setup(); await ui.run('loading'); await ui.run('saving')
    expect(saveEmbeddingSettings).toHaveBeenCalledWith(expect.objectContaining({enabled: false, model: '', apiKey: ''}), expect.any(AbortSignal))
  })
  it('loads safe values and tests unsaved credentials without browser persistence', async () => {
    const setItem = vi.fn(); vi.stubGlobal('localStorage', {setItem})
    const {ui} = setup(); await ui.run('loading')
    expect(ui.form.apiKey).toBe(''); expect(ui.saved.value?.hasApiKey).toBe(true)
    ui.form.apiKey = 'fixture-secret'; await ui.run('testing')
    expect(ui.connection.value).toEqual(connection)
    expect(saveEmbeddingSettings).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    ui.form.minSimilarity = 0.4
    expect(ui.connection.value).toBeNull(); expect(ui.message.value).toBe('')
    await ui.run('saving')
    expect(ui.form.apiKey).toBe(''); expect(ui.message.value).toContain('已保存到后端')
  })
  it('validates model, dimensions, similarity and initial credentials', async () => {
    const {ui} = setup(); await ui.run('loading')
    ui.form.model = ''; await ui.run('testing'); expect(ui.errors.value.model).toBeTruthy()
    ui.form.model = 'embedding-fixture'; ui.form.dimensions = 0
    await ui.run('saving'); expect(ui.errors.value.dimensions).toBeTruthy()
    ui.form.dimensions = null; ui.form.minSimilarity = 2
    await ui.run('saving'); expect(ui.errors.value.minSimilarity).toBeTruthy()
    ui.form.minSimilarity = 0.35
    vi.mocked(getEmbeddingSettings).mockResolvedValueOnce({...initial, hasApiKey: false})
    await ui.run('loading'); await ui.run('testing')
    expect(ui.errors.value.apiKey).toBeTruthy(); expect(testEmbeddingConnection).not.toHaveBeenCalled()
  })
  it('requires reentry when the destination changes and preserves input on failure', async () => {
    const {ui} = setup(); await ui.run('loading')
    ui.form.baseUrl = 'https://another.invalid/v1'; await ui.run('saving')
    expect(ui.errors.value.apiKey).toContain('更换 API 地址')
    ui.form.apiKey = 'keep-fixture-secret'
    vi.mocked(saveEmbeddingSettings).mockRejectedValueOnce(new Error('磁盘写入失败'))
    await ui.run('saving')
    expect(ui.error.value).toBe('磁盘写入失败'); expect(ui.message.value).toBe('')
    expect(ui.form.apiKey).toBe('keep-fixture-secret'); expect(ui.saved.value?.baseUrl).toBe(initial.baseUrl)
  })
  it('prevents duplicate operations and discards test responses for edited forms', async () => {
    const {ui} = setup(); await ui.run('loading')
    let resolve!: (value: typeof connection) => void
    vi.mocked(testEmbeddingConnection).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = ui.run('testing'); await ui.run('testing'); await ui.run('saving')
    expect(testEmbeddingConnection).toHaveBeenCalledTimes(1); expect(saveEmbeddingSettings).not.toHaveBeenCalled()
    ui.form.model = 'edited-model'; resolve(connection); await pending
    expect(ui.connection.value).toBeNull(); expect(ui.form.model).toBe('edited-model')
  })
  it('aborts on disposal, removes the in-memory key and ignores late responses', async () => {
    const {ui, scope} = setup(); await ui.run('loading')
    ui.form.apiKey = 'ephemeral-secret'
    let resolve!: (value: typeof connection) => void
    vi.mocked(testEmbeddingConnection).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = ui.run('testing'), signal = vi.mocked(testEmbeddingConnection).mock.calls[0]![1]!
    scope.stop(); resolve(connection); await pending
    expect(signal.aborted).toBe(true); expect(ui.form.apiKey).toBe(''); expect(ui.connection.value).toBeNull(); expect(ui.busy.value).toBe(false)
  })
})
