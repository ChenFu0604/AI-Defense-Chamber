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

vi.mock('../services/analysis-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/analysis-api')>()
  return { ...original, requestProjectAnalysis: vi.fn() }
})
const requestAnalysis = vi.mocked(requestProjectAnalysis)
let storage: MemoryStorage
beforeEach(() => {
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  requestAnalysis.mockReset()
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
    expect(readAnalysisRecords(storage)).toEqual([analysisFixture()])
  })
  it('preserves a prior live result on failed reanalysis and supports retry', async () => {
    saveAnalysisRecord(analysisFixture(), storage)
    const store = useAnalysisStore()
    store.restore(analysisProject)
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
    expect(readAnalysisRecords(storage)).toHaveLength(2)
    setActivePinia(createPinia())
    const restored = useAnalysisStore()
    restored.restore(analysisProject)
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
  it('shows a persistence warning without hiding a genuinely generated result', async () => {
    storage.denyWrites = true
    requestAnalysis.mockResolvedValue(analysisFixture())
    const store = useAnalysisStore()
    await store.run(analysisProject)
    expect(store.stateFor(analysisProject.id)).toMatchObject({
      status: 'success',
      live: analysisFixture(),
    })
    expect(store.stateFor(analysisProject.id).warning).toContain('无法确认')
    expect(storage.data.has(ANALYSIS_STORAGE_KEY)).toBe(false)
  })
  it('does not overwrite corrupt saved analysis data', async () => {
    storage.data.set(ANALYSIS_STORAGE_KEY, '{broken')
    requestAnalysis.mockResolvedValue(analysisFixture())
    const store = useAnalysisStore()
    store.restore(analysisProject)
    expect(store.stateFor(analysisProject.id).warning).toContain('损坏')
    await store.run(analysisProject)
    expect(storage.data.get(ANALYSIS_STORAGE_KEY)).toBe('{broken')
    expect(store.stateFor(analysisProject.id).warning).toContain('未被覆盖')
  })
  it('does not reuse a portrait for changed project material', () => {
    saveAnalysisRecord(analysisFixture(), storage)
    const store = useAnalysisStore()
    store.restore(analysisProject)
    store.restore({ ...analysisProject, name: '新的项目说明' })
    expect(store.stateFor(analysisProject.id).live).toBeNull()
    expect(store.stateFor(analysisProject.id).warning).toContain('资料已变化')
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
