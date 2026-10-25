import { describe, expect, it, vi } from 'vitest'
import { createServerHistoryFeed } from '../composables/useServerHistoryFeed'
import { endedReportSession, reportFixture } from '../../../../tests/fixtures/report'
import type { ServerHistory } from '@defense/shared'

const empty = (): ServerHistory => ({version: 1, projects: [], analyses: [], entries: []})
const populated = (): ServerHistory => ({...empty(), entries: [{session: endedReportSession(), report: reportFixture(), archivedAt: reportFixture().createdAt}]})
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return {promise, resolve} }
const result = (archive: ServerHistory) => ({archive, legacy: [], warnings: []})

describe('live server history after a workspace import', () => {
  it('reloads an already-mounted empty feed when import completion is announced', async () => {
    const load = vi.fn().mockResolvedValueOnce(result(empty())).mockResolvedValueOnce(result(populated()))
    const feed = createServerHistoryFeed(load), target = new EventTarget()
    feed.listen(target)
    await feed.refresh(); expect(feed.archive.value?.entries).toHaveLength(0)
    target.dispatchEvent(new Event('server-workspace-changed'))
    await vi.waitFor(() => expect(feed.archive.value?.entries).toHaveLength(1))
    expect(load).toHaveBeenCalledTimes(2)
    feed.dispose()
  })
  it('aborts superseded reads and ignores stale results after a newer import refresh', async () => {
    const first = deferred<ReturnType<typeof result>>(), second = deferred<ReturnType<typeof result>>()
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const feed = createServerHistoryFeed(load), target = new EventTarget()
    feed.listen(target)
    const pending = feed.refresh()
    target.dispatchEvent(new Event('server-workspace-changed'))
    expect(load.mock.calls[0]![0].aborted).toBe(true)
    second.resolve(result(populated()))
    await vi.waitFor(() => expect(feed.archive.value?.entries).toHaveLength(1))
    first.resolve(result(empty())); await pending
    expect(feed.archive.value?.entries).toHaveLength(1)
    expect(feed.loading.value).toBe(false)
    feed.dispose()
  })
  it('retains already-loaded records on failure and exposes a real retry', async () => {
    const load = vi.fn().mockResolvedValueOnce(result(populated())).mockRejectedValueOnce(new Error('数据库读取失败')).mockResolvedValueOnce(result(empty()))
    const feed = createServerHistoryFeed(load)
    await feed.refresh(); await feed.refresh()
    expect(feed.archive.value?.entries).toHaveLength(1)
    expect(feed.error.value).toBe('数据库读取失败')
    await feed.refresh()
    expect(feed.error.value).toBe(''); expect(feed.archive.value?.entries).toHaveLength(0)
    feed.dispose()
  })
  it('removes listeners, releases pending requests and discards responses after unmount', async () => {
    const pending = deferred<ReturnType<typeof result>>(), load = vi.fn().mockReturnValue(pending.promise)
    const feed = createServerHistoryFeed(load), target = new EventTarget()
    const remove = vi.spyOn(target, 'removeEventListener')
    feed.listen(target)
    const reading = feed.refresh(); feed.dispose()
    expect(load.mock.calls[0]![0].aborted).toBe(true)
    expect(remove).toHaveBeenCalledWith('server-workspace-changed', expect.any(Function))
    pending.resolve(result(populated())); await reading
    target.dispatchEvent(new Event('server-workspace-changed')); await feed.refresh()
    expect(load).toHaveBeenCalledTimes(1)
    expect(feed.archive.value).toBeNull(); expect(feed.loading.value).toBe(false)
  })
})
