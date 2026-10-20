import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useReportStore } from '../stores/report'
import { requestReport, ReportApiError } from '../services/report-api'
import { reportFixture } from '../../../../tests/fixtures/report'
import type { DefenseReport } from '@defense/shared'
vi.mock('../services/report-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/report-api')>()),
  requestReport: vi.fn(),
}))
const request = vi.mocked(requestReport)
beforeEach(() => {
  setActivePinia(createPinia())
  request.mockReset()
})
describe('report page state', () => {
  it('moves from missing history through generating to a successful saved report and blocks double clicks', async () => {
    const store = useReportStore(),
      record = reportFixture()
    request.mockRejectedValueOnce(new ReportApiError('REPORT_NOT_FOUND', '尚无报告'))
    await store.load(record.sessionId)
    expect(store.status).toBe('missing')
    expect(store.report).toBeNull()
    let complete!: (report: DefenseReport) => void
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = store.generate(record.sessionId)
    expect(store.status).toBe('generating')
    await store.generate(record.sessionId)
    expect(request).toHaveBeenCalledTimes(2)
    complete(record)
    await pending
    expect(store.status).toBe('success')
    expect(store.report).toEqual(record)
  })
  it('retains a result on failed read, surfaces model errors and supports retry', async () => {
    const store = useReportStore(),
      record = reportFixture()
    request.mockResolvedValueOnce(record)
    await store.load(record.sessionId)
    request.mockRejectedValueOnce(new ReportApiError('AI_UNAVAILABLE', '模型暂不可用'))
    await store.generate(record.sessionId)
    expect(store.status).toBe('error')
    expect(store.errorCode).toBe('AI_UNAVAILABLE')
    expect(store.report).toEqual(record)
    request.mockResolvedValueOnce(record)
    await store.load(record.sessionId)
    expect(store.status).toBe('success')
    expect(store.error).toBe('')
    expect(request.mock.calls.at(-1)![1]).toBe(false)
  })
  it('loads history after reopening without automatically generating', async () => {
    const record = reportFixture()
    request.mockResolvedValue(record)
    const store = useReportStore()
    await store.load(record.sessionId)
    store.leave()
    setActivePinia(createPinia())
    const reopened = useReportStore()
    await reopened.load(record.sessionId)
    expect(reopened.report).toEqual(record)
    expect(request.mock.calls.every((call) => call[1] === false)).toBe(true)
  })
  it('ignores a late response after leaving or switching sessions', async () => {
    const store = useReportStore(),
      record = reportFixture()
    let complete!: (report: DefenseReport) => void
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = store.generate(record.sessionId)
    const signal = request.mock.calls[0]![2]!
    store.leave()
    expect(signal.aborted).toBe(true)
    const newer = { ...record, sessionId: record.id }
    request.mockResolvedValueOnce(newer)
    await store.load(newer.sessionId)
    complete(record)
    await pending
    expect(store.report?.sessionId).toBe(newer.sessionId)
    expect(store.status).toBe('success')
  })
})
