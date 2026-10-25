import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { compareHistoryReports, calculateOverallScore } from '@defense/shared'
import {
  archiveProject,
  archiveAnalysis,
  archiveSession,
  archiveReport,
  readHistory,
  HISTORY_KEY,
  readPendingCreation,
} from '../services/history-storage'
import { loadHistorySources, syncHistoricalSession } from '../services/history-service'
import { serverRequest } from '../services/server-api'
import { useDefenseStore } from '../stores/defense'
import { useHistoryStore } from '../stores/history'
import { defenseApi } from '../services/defense-api'
import { requestReport, ReportApiError } from '../services/report-api'
import { analysisProject, analysisFixture } from '../../../../tests/fixtures/analysis'
import { endedReportSession, legacyReportFixture, reportFixture } from '../../../../tests/fixtures/report'
import { MemoryStorage } from './project-fixtures'
vi.mock('../services/defense-api', async (original) => ({
  ...(await original<typeof import('../services/defense-api')>()),
  defenseApi: vi.fn(),
}))
vi.mock('../services/report-api', async (original) => ({
  ...(await original<typeof import('../services/report-api')>()),
  requestReport: vi.fn(),
}))
vi.mock('../services/server-api', () => ({ serverRequest: vi.fn() }))
let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  setActivePinia(createPinia())
  vi.mocked(defenseApi).mockReset()
  vi.mocked(requestReport).mockReset()
  vi.mocked(serverRequest).mockReset()
})
afterEach(() => vi.unstubAllGlobals())
describe('local history archive', () => {
  it('keeps old project archives readable as a migration source', () => {
    archiveProject(analysisProject)
    expect(readHistory().projects[0]).toEqual(analysisProject)
  })
  it('persists project, analysis, full messages and exact report without model calls', () => {
    const session = endedReportSession(),
      report = reportFixture()
    archiveProject(session.project)
    archiveAnalysis(session.analysis)
    archiveSession(session)
    archiveReport(report)
    const restored = readHistory()
    expect(restored.entries[0]!.session).toEqual(session)
    expect(restored.entries[0]!.report).toEqual(report)
    expect(restored.analyses[0]).toEqual(session.analysis)
    expect(defenseApi).not.toHaveBeenCalled()
    expect(requestReport).not.toHaveBeenCalled()
    expect(storage.data.get(HISTORY_KEY)).not.toMatch(/apiKey|Authorization|OPENAI_API_KEY/)
  })
  it('restores legacy and partial reports together without migrating or rescoring either snapshot', () => {
    const original = endedReportSession(), legacy = legacyReportFixture()
    const later = { ...endedReportSession(), id: crypto.randomUUID() }
    const partial = { ...reportFixture(), id: crypto.randomUUID(), sessionId: later.id }
    partial.output.dimensions.technical = {
      status: 'insufficient', score: null, reason: '本轮未讨论技术方案。', references: [],
    }
    partial.overallScore = null
    archiveSession(original)
    archiveReport(legacy)
    archiveSession(later)
    archiveReport(partial)
    const raw = storage.data.get(HISTORY_KEY)
    const history = readHistory()
    expect(history.entries.find(entry => entry.session.id === original.id)?.report).toEqual(legacy)
    expect(history.entries.find(entry => entry.session.id === later.id)?.report).toEqual(partial)
    expect(storage.data.get(HISTORY_KEY)).toBe(raw)
    expect(defenseApi).not.toHaveBeenCalled()
    expect(requestReport).not.toHaveBeenCalled()
  })
  it('retains original historical snapshots when the current project changes', () => {
    const session = endedReportSession()
    archiveSession(session)
    archiveReport(reportFixture())
    archiveProject({ ...session.project, description: '后续修改资料' })
    expect(readHistory().entries[0]!.session.project.description).toBe(session.project.description)
    expect(readHistory().projects[0]!.description).toBe('后续修改资料')
  })
  it.each([
    '{broken',
    JSON.stringify({ version: 9 }),
    JSON.stringify({ version: 1, projects: [], analyses: [], entries: [{}] }),
  ])('protects damaged, incomplete or unsupported data', (raw) => {
    storage.data.set(HISTORY_KEY, raw)
    expect(() => readHistory()).toThrow('原数据已保留')
    expect(() => archiveProject(analysisProject)).toThrow()
    expect(storage.data.get(HISTORY_KEY)).toBe(raw)
  })
  it('migrates supported version zero without modifying its original bytes on read', () => {
    const raw = JSON.stringify({
      version: 0,
      entries: [
        {
          session: endedReportSession(),
          report: reportFixture(),
          archivedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
    })
    storage.data.set(HISTORY_KEY, raw)
    expect(readHistory().version).toBe(1)
    expect(readHistory().entries[0]!.report).toEqual(reportFixture())
    expect(storage.data.get(HISTORY_KEY)).toBe(raw)
    archiveProject(analysisProject)
    expect(JSON.parse(storage.data.get(HISTORY_KEY)!).version).toBe(1)
  })
  it('does not overwrite old reports or accept a report for a different session', () => {
    archiveSession(endedReportSession())
    archiveReport(reportFixture())
    const before = storage.data.get(HISTORY_KEY)
    const different = reportFixture()
    different.output.summary = '不同的评价'
    expect(() => archiveReport(different)).toThrow('未覆盖旧评分')
    expect(() => archiveReport({ ...reportFixture(), sessionId: reportFixture().id })).toThrow(
      '缺少完整会话',
    )
    expect(storage.data.get(HISTORY_KEY)).toBe(before)
  })
  it('reports quota failures and preserves previous content rather than evicting old records', () => {
    archiveProject(analysisProject)
    const before = storage.data.get(HISTORY_KEY)
    storage.denyWrites = true
    expect(() => archiveSession(endedReportSession())).toThrow('存储空间不足')
    expect(storage.data.get(HISTORY_KEY)).toBe(before)
  })
  it('applies its explicit capacity limit without pruning earlier sessions', () => {
    const session = endedReportSession()
    session.messages = []
    session.currentQuestionId = null
    // Valid long input: many actual saved answer messages, no fabricated scores.
    const answer = endedReportSession().messages[1]!
    for (let i = 0; i < 100; i++)
      session.messages.push({ ...answer, id: crypto.randomUUID(), content: '长'.repeat(4000) })
    for (let i = 0; i < 3; i++) archiveSession({ ...session, id: crypto.randomUUID() })
    const previous = storage.data.get(HISTORY_KEY)
    expect(() => archiveSession({ ...session, id: crypto.randomUUID() })).toThrow('3 MiB')
    expect(storage.data.get(HISTORY_KEY)).toBe(previous)
  })
  it('reads authoritative server history without blending unimported browser archives into it', async () => {
    archiveSession(endedReportSession())
    const raw = storage.data.get(HISTORY_KEY)
    const remote = { version: 1, projects: [], analyses: [], entries: [] }
    vi.mocked(serverRequest).mockResolvedValue(remote)
    const result = await loadHistorySources()
    expect(result.archive).toEqual(remote)
    expect(serverRequest).toHaveBeenCalledWith('/history', expect.anything(), { signal: undefined })
    expect(storage.data.get(HISTORY_KEY)).toBe(raw)
  })
})
describe('history comparison and readonly sync', () => {
  it('computes both increases and decreases from two saved reports and rejects other projects', () => {
    const before = reportFixture(),
      after = structuredClone(before)
    after.sessionId = crypto.randomUUID()
    after.id = crypto.randomUUID()
    const { logic, evidence } = after.output.dimensions
    if (logic.status !== 'assessed' || evidence.status !== 'assessed')
      throw new Error('本用例需要两项已评估的固定测试分数。')
    logic.score += 9
    evidence.score -= 4
    after.overallScore = calculateOverallScore(after.output.dimensions)
    archiveSession(endedReportSession())
    archiveReport(before)
    archiveSession({ ...endedReportSession(), id: after.sessionId })
    archiveReport(after)
    const saved = readHistory().entries
    const result = compareHistoryReports(
      saved.find((e) => e.session.id === before.sessionId)!.report!,
      saved.find((e) => e.session.id === after.sessionId)!.report!,
    )
    expect(result.overall).toBe(1)
    expect(result.dimensions.find((d) => d.id === 'logic')!.delta).toBe(9)
    expect(result.dimensions.find((d) => d.id === 'evidence')!.delta).toBe(-4)
    expect(() => compareHistoryReports(before, before)).toThrow('两场不同')
    expect(() =>
      compareHistoryReports(before, { ...after, projectId: crypto.randomUUID() }),
    ).toThrow('同一项目')
  })
  it('syncs legacy sessions and exact history with GET-only report reads', async () => {
    vi.mocked(defenseApi).mockResolvedValue(endedReportSession())
    vi.mocked(requestReport).mockResolvedValue(reportFixture())
    await syncHistoricalSession(endedReportSession().id)
    expect(readHistory().entries).toEqual([])
    expect(vi.mocked(defenseApi).mock.calls[0]).toEqual(['/' + endedReportSession().id])
    expect(vi.mocked(requestReport).mock.calls[0]).toEqual([endedReportSession().id, false])
  })
  it('does not treat an API failure as a missing report or create a browser copy', async () => {
    vi.mocked(defenseApi).mockResolvedValue(endedReportSession())
    vi.mocked(requestReport).mockRejectedValue(new ReportApiError('NETWORK_ERROR', '网络失败'))
    await expect(syncHistoricalSession(endedReportSession().id)).rejects.toThrow('网络失败')
    expect(readHistory().entries).toEqual([])
  })
})
describe('new training creation recovery', () => {
  it('reuses a normal creation request after refresh regardless of envelope property order', async () => {
    const source = endedReportSession()
    const input = {
      project: source.project,
      analysis: source.analysis,
      mode: source.mode,
      judgeId: source.currentJudgeId,
    }
    vi.mocked(defenseApi).mockRejectedValueOnce(new Error('连接中断'))
    await useDefenseStore().start(input)
    const pending = readPendingCreation()!
    const id = pending.input.requestId
    setActivePinia(createPinia())
    vi.mocked(defenseApi).mockResolvedValueOnce({
      ...source,
      id,
      status: 'ready',
      messages: [],
      currentQuestionId: null,
      endedAt: null,
    })
    expect((await useDefenseStore().start(input))?.id).toBe(id)
    expect(vi.mocked(defenseApi).mock.calls[1]![1]).toHaveProperty('requestId', id)
    expect(readPendingCreation()).toBeNull()
  })
  it('retains retraining ID after failed request and reuses it after refreshing the store', async () => {
    const source = endedReportSession()
    const store = useDefenseStore()
    vi.mocked(defenseApi).mockRejectedValueOnce(new Error('网络中断'))
    expect(await store.retrain(source.id, 'technical')).toBeNull()
    const pending = readPendingCreation()!
    expect(pending.kind).toBe('retrain')
    const id = pending.input.requestId
    setActivePinia(createPinia())
    const next = {
      ...source,
      id,
      status: 'ready' as const,
      messages: [],
      currentQuestionId: null,
      endedAt: null,
      training: {
        sourceSessionId: source.id,
        sourceReportId: reportFixture().id,
        focus: ['重点补充数据'],
      },
    }
    vi.mocked(defenseApi).mockResolvedValueOnce(next)
    const result = await useDefenseStore().retrain(source.id, 'technical')
    expect(result?.id).toBe(id)
    expect(vi.mocked(defenseApi).mock.calls[1]![1]).toEqual(pending.input)
    expect(readPendingCreation()).toBeNull()
    expect(useDefenseStore().session?.id).toBe(id)
  })
})
