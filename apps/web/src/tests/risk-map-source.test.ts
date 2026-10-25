import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRiskMap } from '../services/risk-map-source'
import { serverRequest } from '../services/server-api'
import { defenseApi } from '../services/defense-api'
import { requestReport, ReportApiError } from '../services/report-api'
import { analysisFixture, analysisProject } from '../../../../tests/fixtures/analysis'
import { endedReportSession, reportFixture } from '../../../../tests/fixtures/report'
vi.mock('../services/server-api', () => ({ serverRequest: vi.fn() }))
vi.mock('../services/defense-api', () => ({ defenseApi: vi.fn() }))
vi.mock('../services/report-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/report-api')>()),
  requestReport: vi.fn(),
}))
beforeEach(() => {
  vi.mocked(serverRequest).mockReset().mockImplementation(async (path) => path.endsWith('/analyses') ? [analysisFixture()] : analysisProject)
  vi.mocked(defenseApi).mockReset().mockResolvedValue(endedReportSession())
  vi.mocked(requestReport).mockReset().mockResolvedValue(reportFixture())
})
describe('risk map source loading', () => {
  it('reads saved server project analysis without model generation and keeps demo explicit', async () => {
    const source = { kind: 'project' as const, id: analysisProject.id, mode: 'live' as const }
    expect((await loadRiskMap(source)).graph.nodes.length).toBeGreaterThan(0)
    vi.mocked(serverRequest).mockImplementation(async (path) => path.endsWith('/analyses') ? [analysisFixture('demo')] : analysisProject)
    expect((await loadRiskMap(source)).graph.nodes).toEqual([])
    expect((await loadRiskMap({ ...source, mode: 'demo' })).graph.mode).toBe('demo')
    expect(defenseApi).not.toHaveBeenCalled()
    expect(requestReport).not.toHaveBeenCalled()
    expect(vi.mocked(serverRequest).mock.calls.every(call => !call[2]?.body && !call[2]?.method)).toBe(true)
  })
  it('surfaces missing projects, invalid IDs and backend failures without local fallback', async () => {
    const source = { kind: 'project' as const, id: analysisProject.id, mode: 'live' as const }
    await expect(loadRiskMap({ ...source, id: 'invalid' })).rejects.toThrow('ID 无效')
    vi.mocked(serverRequest).mockRejectedValueOnce(new Error('没有该项目'))
    await expect(loadRiskMap(source)).rejects.toThrow('没有该项目')
    vi.mocked(serverRequest).mockRejectedValueOnce(new Error('数据库读取失败'))
    await expect(loadRiskMap(source)).rejects.toThrow('数据库读取失败')
  })
  it('reads session and report with GET only and explicitly handles missing reports', async () => {
    const source = { kind: 'session' as const, id: endedReportSession().id }
    const loaded = await loadRiskMap(source)
    expect(loaded.graph.reportId).toBe(reportFixture().id)
    expect(vi.mocked(requestReport).mock.calls[0]![1]).toBe(false)
    vi.mocked(requestReport).mockRejectedValueOnce(
      new ReportApiError('REPORT_NOT_FOUND', '尚无报告'),
    )
    const partial = await loadRiskMap(source)
    expect(partial.graph.reportId).toBeNull()
    expect(partial.notice).toContain('尚未生成评分报告')
    expect(partial.graph.nodes.length).toBeGreaterThan(0)
  })
  it('surfaces failed report reads instead of pretending the report is missing', async () => {
    vi.mocked(requestReport).mockRejectedValueOnce(
      new ReportApiError('NETWORK_ERROR', '报告网络异常'),
    )
    await expect(loadRiskMap({ kind: 'session', id: endedReportSession().id })).rejects.toThrow(
      '报告网络异常',
    )
  })
  it('avoids report calls for demo or unfinished sessions and honors cancellation', async () => {
    const session = endedReportSession(),
      source = { kind: 'session' as const, id: session.id }
    session.status = 'awaiting_answer'
    session.endedAt = null
    vi.mocked(defenseApi).mockResolvedValue(session)
    expect((await loadRiskMap(source)).notice).toContain('尚未结束')
    const demo = endedReportSession()
    demo.mode = 'demo'
    demo.analysis = analysisFixture('demo')
    demo.messages[0]!.model = null
    vi.mocked(defenseApi).mockResolvedValue(demo)
    expect((await loadRiskMap(source)).graph.mode).toBe('demo')
    expect(requestReport).not.toHaveBeenCalled()
    const controller = new AbortController()
    controller.abort()
    await expect(loadRiskMap(source, controller.signal)).rejects.toThrow()
  })
})
