import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createImprovementTask, type ImprovementTask } from '@defense/shared'
import { useHistoryStore } from '../stores/history'
import { useImprovementsStore } from '../stores/improvements'
import { useDefenseStore } from '../stores/defense'
import { useReportStore } from '../stores/report'
import { serverRequest } from '../services/server-api'
import { defenseApi } from '../services/defense-api'
import { requestReport } from '../services/report-api'
import { downloadHistoryBackup } from '../services/history-service'
import { downloadImprovementBackup } from '../services/improvement-api'
import { endedReportSession, reportFixture } from '../../../../tests/fixtures/report'
import { MemoryStorage } from './project-fixtures'
vi.mock('../services/server-api', () => ({ serverRequest: vi.fn() }))
vi.mock('../services/defense-api', async original => ({ ...(await original<typeof import('../services/defense-api')>()), defenseApi: vi.fn() }))
vi.mock('../services/report-api', async original => ({ ...(await original<typeof import('../services/report-api')>()), requestReport: vi.fn() }))
const remote = vi.mocked(serverRequest)
const source = () => ({ version: 1 as const, projects: [], analyses: [], entries: [{ session: endedReportSession(), report: reportFixture(), archivedAt: reportFixture().createdAt }] })
const task = () => createImprovementTask(reportFixture(), 0, '校园项目', crypto.randomUUID(), '2026-10-25T00:00:00.000Z')
beforeEach(() => { setActivePinia(createPinia()); vi.stubGlobal('localStorage', new MemoryStorage()); remote.mockReset(); vi.mocked(defenseApi).mockReset(); vi.mocked(requestReport).mockReset() })
afterEach(() => vi.unstubAllGlobals())

describe('server-authoritative history and improvement records', () => {
  it('restores history from the backend after recreating stores and keeps visible data on read failure', async () => {
    remote.mockResolvedValue(source())
    const store = useHistoryStore()
    await store.load()
    expect(store.entries[0]?.report).toEqual(reportFixture())
    remote.mockRejectedValueOnce(new Error('数据库暂不可读'))
    expect(await store.load()).toBe(false)
    expect(store.error).toBe('数据库暂不可读')
    expect(store.entries[0]?.report).toEqual(reportFixture())
    setActivePinia(createPinia())
    await useHistoryStore().load()
    expect(useHistoryStore().entries[0]?.session.id).toBe(endedReportSession().id)
    expect(localStorage.getItem('defense-chamber.history.v1')).toBeNull()
  })
  it('does not read old browser records as a successful fallback when the backend fails', async () => {
    localStorage.setItem('defense-chamber.history.v1', JSON.stringify(source()))
    remote.mockRejectedValueOnce(new Error('网络失败'))
    const store = useHistoryStore()
    expect(await store.load()).toBe(false)
    expect(store.entries).toEqual([])
    expect(store.loaded).toBe(false)
    expect(store.error).toBe('网络失败')
  })
  it('forces post-import history and task reads and discards older responses without ending the new loading state', async () => {
    for (const kind of ['history', 'tasks'] as const) {
      remote.mockReset()
      const store = kind === 'history' ? useHistoryStore() : useImprovementsStore()
      let oldDone!: (value: unknown) => void, freshDone!: (value: unknown) => void
      remote.mockImplementationOnce(() => new Promise(resolve => { oldDone = resolve }))
        .mockImplementationOnce(() => new Promise(resolve => { freshDone = resolve }))
      const old = store.load(), fresh = store.load(true)
      expect(remote).toHaveBeenCalledTimes(2)
      oldDone(kind === 'history' ? {...source(), entries: []} : [])
      expect(await old).toBe(false)
      expect(store.loading).toBe(true)
      const saved = task()
      freshDone(kind === 'history' ? source() : [saved])
      expect(await fresh).toBe(true)
      expect(store.loading).toBe(false)
      if (kind === 'history') expect(useHistoryStore().entries[0]?.report).toEqual(reportFixture())
      else expect(useImprovementsStore().tasks).toEqual([saved])
    }
  })
  it('queues an import refresh received during a task save so its older response cannot hide imported tasks', async () => {
    const store = useImprovementsStore(), saved = task(), imported = task()
    let finishSave!: (value: ImprovementTask[]) => void
    remote.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve }))
      .mockResolvedValueOnce([saved, imported])
    const saving = store.add(reportFixture(), 0)
    expect(await store.load(true)).toBe(false)
    expect(remote).toHaveBeenCalledTimes(1)
    finishSave([saved])
    expect(await saving).toBe(true)
    await vi.waitFor(() => expect(store.tasks).toEqual([saved, imported]))
    expect(remote).toHaveBeenCalledTimes(2)
  })
  it('blocks duplicate task saves, waits for server confirmation and keeps drafts/errors on failure', async () => {
    const store = useImprovementsStore(), saved = task()
    remote.mockResolvedValueOnce([saved]); await store.load()
    let complete!: (records: ImprovementTask[]) => void
    remote.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const update = { status: 'in_progress' as const, note: '已完成访谈，待核对结果。' }
    const pending = store.update(saved, update)
    expect(store.busy).toBe(true)
    expect(await store.load()).toBe(false)
    expect(store.tasks[0]?.note).toBe('')
    expect(await store.update(saved, update)).toBe(false)
    expect(remote).toHaveBeenCalledTimes(2)
    expect(remote.mock.calls[1]).toEqual(['/improvements/' + saved.id, expect.anything(), { method: 'PUT', body: { expectedUpdatedAt: saved.updatedAt, update } }])
    complete([{ ...saved, ...update }]); expect(await pending).toBe(true)
    expect(store.tasks[0]?.note).toBe(update.note)
    remote.mockRejectedValueOnce(new Error('任务版本已变化，未覆盖'))
    expect(await store.update(saved, { status: 'done', note: '准备复训' })).toBe(false)
    expect(store.error).toContain('未覆盖')
    expect(store.tasks[0]?.note).toBe(update.note)
    expect(localStorage.getItem('defense-chamber.improvements.v1')).toBeNull()
  })
  it('does not let an older task-list read overwrite a confirmed write', async () => {
    const store = useImprovementsStore(), saved = task()
    let complete!: (records: ImprovementTask[]) => void
    remote.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const reading = store.load()
    remote.mockResolvedValueOnce([saved])
    expect(await store.add(reportFixture(), 0)).toBe(true)
    expect(remote.mock.calls[1]).toEqual(['/improvements', expect.anything(), { method: 'POST', body: { sourceSessionId: reportFixture().sessionId, improvementIndex: 0 } }])
    complete([]); await reading
    expect(store.tasks).toEqual([saved])
  })
  it('loads sessions and reports even when browser formal-record storage is corrupt', async () => {
    for (const key of ['defense-chamber.history.v1', 'defense-chamber.sessions.v1']) localStorage.setItem(key, '{broken')
    vi.mocked(defenseApi).mockResolvedValueOnce(endedReportSession())
    await useDefenseStore().load(endedReportSession().id)
    expect(useDefenseStore().session).toEqual(endedReportSession())
    vi.mocked(requestReport).mockResolvedValueOnce(reportFixture())
    await useReportStore().load(endedReportSession().id)
    expect(useReportStore().report).toEqual(reportFixture())
    expect(useReportStore().warning).toBe('')
    expect(localStorage.getItem('defense-chamber.history.v1')).toBe('{broken')
    expect(localStorage.getItem('defense-chamber.sessions.v1')).toBe('{broken')
  })
  it('exports fresh backend snapshots and never exports stale browser copies', async () => {
    vi.useFakeTimers()
    const payloads: Blob[] = [], links: { href: string; download: string; click: ReturnType<typeof vi.fn> }[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { payloads.push(blob as Blob); return 'blob:test' })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('document', { createElement: () => { const link = { href: '', download: '', click: vi.fn() }; links.push(link); return link } })
    localStorage.setItem('defense-chamber.history.v1', 'stale')
    localStorage.setItem('defense-chamber.improvements.v1', 'stale')
    try {
      remote.mockResolvedValueOnce(source())
      await downloadHistoryBackup()
      remote.mockResolvedValueOnce([task()])
      await downloadImprovementBackup()
      expect(JSON.parse(await payloads[0]!.text())).toEqual(source())
      expect(JSON.parse(await payloads[1]!.text()).tasks).toHaveLength(1)
      expect(links.map(link => link.download)).toEqual(['defense-history-backup.json', 'defense-improvement-tasks.json'])
      expect(links.every(link => link.click.mock.calls.length === 1)).toBe(true)
      remote.mockRejectedValueOnce(new Error('导出读取失败'))
      await expect(downloadHistoryBackup()).rejects.toThrow('导出读取失败')
      expect(links).toHaveLength(2)
    } finally { vi.runAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() }
  })
})
