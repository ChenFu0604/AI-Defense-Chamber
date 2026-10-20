import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { judgeStatusLabels, type JudgeStatement } from '@defense/shared'
import { useJudgesStore } from '../stores/judges'
import { requestJudgeQuestion } from '../services/judges-api'
import { analysisFixture, analysisProject } from '../../../../tests/fixtures/analysis'

vi.mock('../services/judges-api', () => ({ requestJudgeQuestion: vi.fn() }))
const api = vi.mocked(requestJudgeQuestion)
function result(): JudgeStatement {
  return {
    id: crypto.randomUUID(),
    projectId: analysisProject.id,
    analysisId: analysisFixture().id,
    createdAt: new Date().toISOString(),
    mode: 'live',
    model: 'fixture',
    speech: {
      judgeId: 'business',
      question: '如何验证需求？',
      questionType: 'evidence',
      riskLevel: 'medium',
      focus: '需求',
      rationale: '需要证据',
    },
  }
}
beforeEach(() => {
  setActivePinia(createPinia())
  api.mockReset()
})
describe('judge frontend selection and lifecycle', () => {
  it('selects a judge independently of the active pending judge', async () => {
    let resolve!: (value: JudgeStatement) => void
    api.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const store = useJudgesStore()
    expect(store.statuses.business).toBe('waiting')
    const pending = store.run(analysisProject, analysisFixture(), 'live')
    expect(store.statuses.business).toBe('analyzing')
    expect(store.busy).toBe(true)
    store.select('technical')
    expect(store.selectedId).toBe('technical')
    expect(store.activeId).toBe('business')
    await store.run(analysisProject, analysisFixture(), 'live')
    expect(api).toHaveBeenCalledTimes(1)
    resolve(result())
    await pending
    expect(store.statuses.business).toBe('questioning')
    expect(store.busy).toBe(false)
    store.complete('business')
    expect(store.statuses.business).toBe('completed')
    expect(judgeStatusLabels.completed).toBe('完成')
  })
  it('preserves earlier questions on failure and supports retry', async () => {
    const store = useJudgesStore()
    api
      .mockResolvedValueOnce(result())
      .mockRejectedValueOnce(new Error('模型超时'))
      .mockResolvedValueOnce(result())
    await store.run(analysisProject, analysisFixture(), 'live')
    await store.run(analysisProject, analysisFixture(), 'live')
    expect(store.statuses.business).toBe('error')
    expect(store.error).toBe('模型超时')
    expect(store.statements).toHaveLength(1)
    await store.run(analysisProject, analysisFixture(), 'live')
    expect(store.error).toBe('')
    expect(store.statements).toHaveLength(2)
    expect(api.mock.calls[2]![0].history).toHaveLength(1)
  })
  it('discards late results after cancel or project/mode change', async () => {
    let resolve!: (value: JudgeStatement) => void
    api.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const store = useJudgesStore()
    store.prepare('project/live/analysis1')
    const pending = store.run(analysisProject, analysisFixture(), 'live')
    store.prepare('project/demo/analysis2')
    resolve(result())
    await pending
    expect(store.statements).toHaveLength(0)
    expect(store.busy).toBe(false)
    expect(store.statuses.business).toBe('waiting')
    expect(api.mock.calls[0]![1]?.aborted).toBe(true)
  })
  it('calls four judges sequentially, passing all earlier questions as history', async () => {
    let inFlight = 0
    api.mockImplementation(async (request) => {
      expect(inFlight).toBe(0)
      inFlight++
      await Promise.resolve()
      inFlight--
      return { ...result(), speech: { ...result().speech, judgeId: request.judgeId } }
    })
    const store = useJudgesStore()
    await store.run(analysisProject, analysisFixture(), 'live', true)
    expect(api.mock.calls.map((call) => call[0].judgeId)).toEqual([
      'business',
      'technical',
      'user',
      'devil',
    ])
    expect(api.mock.calls.map((call) => call[0].history.length)).toEqual([0, 1, 2, 3])
    expect(Object.values(store.statuses)).toEqual(Array(4).fill('questioning'))
  })
  it('stops an ordered round at failure without discarding completed requests', async () => {
    api.mockResolvedValueOnce(result()).mockRejectedValueOnce(new Error('服务失败'))
    const store = useJudgesStore()
    await store.run(analysisProject, analysisFixture(), 'live', true)
    expect(api).toHaveBeenCalledTimes(2)
    expect(store.statements).toHaveLength(1)
    expect(store.statuses.technical).toBe('error')
    expect(store.statuses.user).toBe('waiting')
    store.clear()
    expect(store.statements).toHaveLength(0)
  })
})
