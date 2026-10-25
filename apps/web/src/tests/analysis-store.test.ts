import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AnalysisRecord } from '@defense/shared'
import { useAnalysisStore } from '../stores/analysis'
import { AnalysisApiError, requestProjectAnalysis } from '../services/analysis-api'
import {
  ANALYSIS_STORAGE_KEY,
  readAnalysisRecords,
  saveAnalysisRecord,
} from '../services/analysis-storage'
import { MemoryStorage } from './project-fixtures'
import { analysisFixture, analysisProject } from '../../../../tests/fixtures/analysis'
import { serverRequest, ServerApiError } from '../services/server-api'
import { createWorkspaceApiFixture } from './server-workspace-fixture'
vi.mock('../services/server-api', async original => ({...(await original<typeof import('../services/server-api')>()), serverRequest: vi.fn()}))

vi.mock('../services/analysis-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/analysis-api')>()
  return { ...original, requestProjectAnalysis: vi.fn() }
})
const requestAnalysis = vi.mocked(requestProjectAnalysis)
let storage: MemoryStorage
let backend: ReturnType<typeof createWorkspaceApiFixture>
beforeEach(() => {
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  requestAnalysis.mockReset()
  backend = createWorkspaceApiFixture({projects: [analysisProject]})
  vi.mocked(serverRequest).mockReset(); vi.mocked(serverRequest).mockImplementation(backend.request)
})
afterEach(() => vi.unstubAllGlobals())

describe('frontend analysis states', () => {
  it('moves from idle to loading to a persisted success and prevents double submit', async () => {
    let resolve!: (record: AnalysisRecord) => void
    requestAnalysis.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const store = useAnalysisStore()
    expect(store.stateFor(analysisProject.id).status).toBe('idle')
    const pending = store.run(analysisProject)
    expect(store.stateFor(analysisProject.id).status).toBe('loading')
    expect(await store.run(analysisProject)).toBeNull()
    expect(requestAnalysis).toHaveBeenCalledTimes(1)
    resolve(analysisFixture())
    await pending
    expect(store.stateFor(analysisProject.id).status).toBe('success')
    expect(readAnalysisRecords(storage)).toEqual([])
  })
  it('preserves a prior live result on failed reanalysis and supports retry', async () => {
    backend.analyses.push(analysisFixture())
    const store = useAnalysisStore()
    await store.restore(analysisProject)
    requestAnalysis.mockRejectedValueOnce(new AnalysisApiError('AI_TIMEOUT', '模型超时'))
    expect(await store.run(analysisProject)).toBeNull()
    expect(store.stateFor(analysisProject.id)).toMatchObject({
      status: 'error',
      errorCode: 'AI_TIMEOUT',
      live: analysisFixture(),
      demo: null,
    })
    requestAnalysis.mockResolvedValueOnce(analysisFixture())
    await store.run(analysisProject)
    expect(store.stateFor(analysisProject.id)).toMatchObject({ status: 'success', error: '' })
  })
  it('never falls back to demo on missing model configuration', async () => {
    requestAnalysis.mockRejectedValue(new AnalysisApiError('AI_NOT_CONFIGURED', '请先配置模型'))
    const store = useAnalysisStore()
    await store.run(analysisProject)
    expect(requestAnalysis).toHaveBeenCalledTimes(1)
    expect(requestAnalysis.mock.calls[0]?.[1]).toBe('live')
    expect(store.stateFor(analysisProject.id)).toMatchObject({
      status: 'error',
      errorCode: 'AI_NOT_CONFIGURED',
      live: null,
      demo: null,
    })
  })
  it('keeps demo and real results separate and restores both', async () => {
    const store = useAnalysisStore()
    requestAnalysis.mockResolvedValueOnce(analysisFixture())
    await store.run(analysisProject, 'live')
    requestAnalysis.mockResolvedValueOnce(analysisFixture('demo'))
    await store.run(analysisProject, 'demo')
    expect(store.stateFor(analysisProject.id).activeMode).toBe('demo')
    expect(readAnalysisRecords(storage)).toHaveLength(0)
    backend.analyses.push(analysisFixture(), analysisFixture('demo'))
    setActivePinia(createPinia())
    const restored = useAnalysisStore()
    await restored.restore(analysisProject)
    expect(restored.stateFor(analysisProject.id)).toMatchObject({
      activeMode: 'live',
      live: analysisFixture(),
      demo: analysisFixture('demo'),
      status: 'success',
    })
  })
  it('ignores a late response after cancellation', async () => {
    let resolve!: (record: AnalysisRecord) => void
    requestAnalysis.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const store = useAnalysisStore()
    const pending = store.run(analysisProject)
    const signal = requestAnalysis.mock.calls[0]?.[2]
    store.cancel(analysisProject.id)
    expect(signal?.aborted).toBe(true)
    expect(store.stateFor(analysisProject.id).status).toBe('cancelled')
    resolve(analysisFixture())
    await pending
    expect(store.stateFor(analysisProject.id).live).toBeNull()
    expect(storage.data.has(ANALYSIS_STORAGE_KEY)).toBe(false)
  })
  it('does not let a cancelled request overwrite a newer success', async () => {
    let resolveOld!: (record: AnalysisRecord) => void
    requestAnalysis.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolveOld = done
        }),
    )
    const store = useAnalysisStore()
    const old = store.run(analysisProject)
    store.cancel(analysisProject.id)
    const newer = { ...analysisFixture(), id: '55555555-5555-4555-8555-555555555555' }
    requestAnalysis.mockResolvedValueOnce(newer)
    await store.run(analysisProject)
    resolveOld(analysisFixture())
    await old
    expect(store.stateFor(analysisProject.id).live?.id).toBe(newer.id)
  })
  it('accepts a confirmed service response without writing a duplicate browser record', async () => {
    storage.denyWrites = true
    requestAnalysis.mockResolvedValue(analysisFixture())
    const store = useAnalysisStore()
    await store.run(analysisProject)
    expect(store.stateFor(analysisProject.id)).toMatchObject({
      status: 'success',
      live: analysisFixture(),
    })
    expect(store.stateFor(analysisProject.id).warning).toBe('')
    expect(storage.data.has(ANALYSIS_STORAGE_KEY)).toBe(false)
  })
  it('does not read or overwrite corrupt legacy browser analysis data', async () => {
    storage.data.set(ANALYSIS_STORAGE_KEY, '{broken')
    requestAnalysis.mockResolvedValue(analysisFixture())
    const store = useAnalysisStore()
    await store.restore(analysisProject)
    expect(store.stateFor(analysisProject.id).warning).toBe('')
    await store.run(analysisProject)
    expect(storage.data.get(ANALYSIS_STORAGE_KEY)).toBe('{broken')
    expect(store.stateFor(analysisProject.id).warning).toBe('')
  })
  it('does not reuse a portrait for changed project material', async () => {
    backend.analyses.push(analysisFixture())
    const store = useAnalysisStore()
    await store.restore(analysisProject)
    await store.restore({ ...analysisProject, name: '新的项目说明' })
    expect(store.stateFor(analysisProject.id).live).toBeNull()
    expect(store.stateFor(analysisProject.id).warning).toContain('资料已变化')
  })
  it('reports backend read failure rather than using an old browser portrait', async () => {
    saveAnalysisRecord(analysisFixture(), storage)
    backend.failNext(new ServerApiError('DATABASE_ERROR', '画像读取失败'))
    const store = useAnalysisStore()
    expect(await store.restore(analysisProject)).toBe(false)
    expect(store.stateFor(analysisProject.id)).toMatchObject({loaded: false, live: null, status: 'error', error: '画像读取失败'})
    backend.analyses.push(analysisFixture())
    expect(await store.restore(analysisProject)).toBe(true)
    expect(store.stateFor(analysisProject.id).live).toEqual(analysisFixture())
  })
  it('ignores a late restore after a fresh generation result', async () => {
    let finish!: (value: unknown) => void
    vi.mocked(serverRequest).mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const store = useAnalysisStore(), restoring = store.restore(analysisProject)
    requestAnalysis.mockResolvedValueOnce(analysisFixture())
    await store.run(analysisProject)
    finish([]); await restoring
    expect(store.stateFor(analysisProject.id)).toMatchObject({status: 'success', live: analysisFixture(), restoring: false})
  })
})

describe('analysis persistence', () => {
  it('updates one mode while retaining other modes and projects', () => {
    saveAnalysisRecord(analysisFixture(), storage)
    saveAnalysisRecord(analysisFixture('demo'), storage)
    const other = { ...analysisFixture(), projectId: '55555555-5555-4555-8555-555555555555' }
    saveAnalysisRecord(other, storage)
    saveAnalysisRecord({ ...analysisFixture(), createdAt: '2026-10-20T05:00:00.000Z' }, storage)
    expect(readAnalysisRecords(storage)).toHaveLength(3)
  })
  it('rejects records that relabel demo output as a live model result', () => {
    expect(() =>
      saveAnalysisRecord({ ...analysisFixture('demo'), mode: 'live' }, storage),
    ).toThrow()
    expect(storage.data.size).toBe(0)
  })
})
