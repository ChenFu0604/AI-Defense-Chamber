import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeProjectWorkspace, PROJECT_STORAGE_KEY } from '../services/project-storage'
import { HISTORY_KEY } from '../services/history-storage'
import { prepareBrowserImport, importBrowserRecords } from '../services/workspace-import'
import { serverRequest } from '../services/server-api'
import { analysisProject } from '../../../../tests/fixtures/analysis'
import { MemoryStorage } from './project-fixtures'
vi.mock('../services/server-api', () => ({ serverRequest: vi.fn() }))
let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  vi.mocked(serverRequest).mockReset()
})
afterEach(() => vi.unstubAllGlobals())
const seed = () => writeProjectWorkspace({version: 1, projects: [analysisProject], revisions: [], archivedIds: []})
describe('explicit browser-to-SQLite migration', () => {
  it('does nothing with empty legacy records and does not request a model or server', async () => {
    expect(await prepareBrowserImport()).toBeNull()
    expect(serverRequest).not.toHaveBeenCalled()
  })
  it('previews valid records and reuses the same request identity after failure or refresh', async () => {
    seed()
    const raw = storage.data.get(PROJECT_STORAGE_KEY), first = (await prepareBrowserImport())!
    expect(first.counts.projects).toBe(1)
    vi.mocked(serverRequest).mockRejectedValueOnce(new Error('服务端冲突，原记录保留'))
    await expect(importBrowserRecords(first)).rejects.toThrow('冲突')
    const retry = (await prepareBrowserImport())!
    expect(retry.input.requestId).toBe(first.input.requestId)
    expect(storage.data.get(PROJECT_STORAGE_KEY)).toBe(raw)
    expect(window.dispatchEvent).not.toHaveBeenCalled()
  })
  it('rejects corrupt data without partly uploading or overwriting it', async () => {
    seed(); storage.setItem(HISTORY_KEY, '{broken')
    await expect(prepareBrowserImport()).rejects.toThrow('损坏')
    expect(storage.getItem(HISTORY_KEY)).toBe('{broken')
    expect(serverRequest).not.toHaveBeenCalled()
  })
  it('checks that the source has not changed after preview', async () => {
    seed(); const preview = (await prepareBrowserImport())!
    writeProjectWorkspace({version: 1, projects: [{...analysisProject, name: '修改后'}], revisions: [], archivedIds: []})
    await expect(importBrowserRecords(preview)).rejects.toThrow('预览后发生变化')
    expect(serverRequest).not.toHaveBeenCalled()
  })
  it('recovers from syntactically valid but invalid migration markers without altering legacy data', async () => {
    seed(); const first = (await prepareBrowserImport())!
    localStorage.setItem('defense-chamber.sqlite-import.v1', JSON.stringify({fingerprint: first.fingerprint, requestId: 'broken', confirmed: true}))
    const fresh = (await prepareBrowserImport())!
    expect(fresh.input.requestId).not.toBe('broken')
    expect(fresh.input.projects.projects).toEqual([analysisProject])
    expect(serverRequest).not.toHaveBeenCalled()
  })
  it('confirms server receipts and retains legacy bytes instead of treating a local marker as authority', async () => {
    seed(); const raw = storage.getItem(PROJECT_STORAGE_KEY), preview = (await prepareBrowserImport())!
    const receipt = {requestId: preview.input.requestId, alreadyImported: false, counts: preview.counts}
    vi.mocked(serverRequest).mockResolvedValueOnce(receipt)
    expect(await importBrowserRecords(preview)).toEqual(receipt)
    expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe(raw)
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1)
    vi.mocked(serverRequest).mockResolvedValueOnce({...receipt, alreadyImported: true})
    expect(await prepareBrowserImport()).toBeNull()
    vi.mocked(serverRequest).mockResolvedValueOnce(null)
    const restoredBackend = (await prepareBrowserImport())!
    expect(restoredBackend.input.requestId).toBe(preview.input.requestId)
  })
})
