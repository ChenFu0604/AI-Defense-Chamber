import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { type AnalysisRecord, type CreateDefenseRequest } from '@defense/shared'
import { useTrainingPreparation } from '../composables/useTrainingPreparation'
import { requestProjectAnalysis, AnalysisApiError } from '../services/analysis-api'
import { defenseApi } from '../services/defense-api'
import { saveAnalysisRecord } from '../services/analysis-storage'
import { analysisFixture, analysisProject } from '../../../../tests/fixtures/analysis'
import { defenseFixture } from '../../../../tests/fixtures/defense'
import { MemoryStorage } from './project-fixtures'

vi.mock('../services/analysis-api', async (original) => ({
  ...(await original<typeof import('../services/analysis-api')>()), requestProjectAnalysis: vi.fn(),
}))
vi.mock('../services/defense-api', async (original) => ({
  ...(await original<typeof import('../services/defense-api')>()), defenseApi: vi.fn(),
}))
const analyze = vi.mocked(requestProjectAnalysis), api = vi.mocked(defenseApi)
const scopes: EffectScope[] = []
function setup() {
  const scope = effectScope(), project = ref(structuredClone(analysisProject))
  scopes.push(scope)
  return { scope, project, preparation: scope.run(() => useTrainingPreparation(project))! }
}
beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('localStorage', new MemoryStorage())
  analyze.mockReset()
  api.mockReset()
  analyze.mockResolvedValue(analysisFixture())
  api.mockImplementation(async (_path, body) => {
    const input = body as CreateDefenseRequest
    return { ...defenseFixture(input.mode), id: input.requestId, project: input.project,
      analysis: input.analysis, currentJudgeId: input.judgeId }
  })
})
afterEach(() => { scopes.splice(0).forEach((scope) => scope.stop()); vi.unstubAllGlobals() })

describe('continuous training preparation', () => {
  it('includes selected preferences in creation and resets confirmation when choices change', async () => {
    const {preparation} = setup()
    preparation.confirmed.value = true
    preparation.preferences.value = {style: 'rehearsal', goal: 'technical', questionLimit: 10}
    expect(preparation.confirmed.value).toBe(false)
    preparation.confirmed.value = true
    await preparation.start()
    expect(api.mock.calls[0]![1]).toMatchObject({preferences: {style: 'rehearsal', goal: 'technical', questionLimit: 10}})
  })
  it('requires confirmation, then analyzes and creates a session without another page', async () => {
    const { preparation } = setup()
    expect(await preparation.start()).toBeNull()
    expect(analyze).not.toHaveBeenCalled()
    preparation.confirmed.value = true
    const session = await preparation.start()
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(api).toHaveBeenCalledTimes(1)
    expect(session?.project).toEqual(analysisProject)
    expect(api.mock.calls[0]![1]).toMatchObject({ mode: 'live', analysis: analysisFixture() })
  })
  it('reuses a matching saved analysis and blocks double clicks while generating', async () => {
    saveAnalysisRecord(analysisFixture())
    const { preparation } = setup()
    let complete!: (value: ReturnType<typeof defenseFixture>) => void
    api.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    preparation.confirmed.value = true
    const first = preparation.start()
    expect(await preparation.start()).toBeNull()
    expect(analyze).not.toHaveBeenCalled()
    expect(api).toHaveBeenCalledTimes(1)
    complete({ ...defenseFixture(), id: (api.mock.calls[0]![1] as CreateDefenseRequest).requestId })
    expect(await first).toBeTruthy()
  })
  it('keeps a configuration failure visible without creating a session or switching to demo', async () => {
    const { preparation } = setup()
    analyze.mockRejectedValueOnce(new AnalysisApiError('AI_NOT_CONFIGURED', '请配置模型'))
    preparation.confirmed.value = true
    expect(await preparation.start()).toBeNull()
    expect(api).not.toHaveBeenCalled()
    expect(preparation.error.value).toBe('请配置模型')
    expect(preparation.mode.value).toBe('live')
    expect(preparation.busy.value).toBe(false)
    expect(await preparation.start()).toBeTruthy()
  })
  it('retains generated analysis and creation ID after a network failure', async () => {
    const { preparation } = setup()
    api.mockRejectedValueOnce(new Error('网络中断'))
    preparation.confirmed.value = true
    expect(await preparation.start()).toBeNull()
    const requestId = (api.mock.calls[0]![1] as CreateDefenseRequest).requestId
    expect(await preparation.start()).toBeTruthy()
    expect(analyze).toHaveBeenCalledTimes(1)
    expect((api.mock.calls[1]![1] as CreateDefenseRequest).requestId).toBe(requestId)
  })
  it('does not create a session from an analysis that completes after leaving', async () => {
    let complete!: (record: AnalysisRecord) => void
    analyze.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
    const { preparation, scope } = setup()
    preparation.confirmed.value = true
    const pending = preparation.start()
    scope.stop()
    complete(analysisFixture())
    expect(await pending).toBeNull()
    expect(api).not.toHaveBeenCalled()
    expect(analyze.mock.calls[0]![2]?.aborted).toBe(true)
  })
  it('requires confirmation again and invalidates the cached analysis after project changes', async () => {
    saveAnalysisRecord(analysisFixture())
    const { preparation, project } = setup()
    preparation.confirmed.value = true
    project.value = { ...project.value, name: '修改后的资料' }
    await nextTick()
    expect(preparation.confirmed.value).toBe(false)
    expect(preparation.analysis.value).toBeNull()
    expect(preparation.state.value.warning).toContain('资料已变化')
    expect(await preparation.start()).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })
})
