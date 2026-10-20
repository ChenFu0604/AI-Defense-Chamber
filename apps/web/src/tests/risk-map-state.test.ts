import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRiskGraph } from '@defense/shared'
import { useRiskMap } from '../composables/useRiskMap'
import { loadRiskMap } from '../services/risk-map-source'
import { endedReportSession, reportFixture } from '../../../../tests/fixtures/report'
vi.mock('../services/risk-map-source', () => ({ loadRiskMap: vi.fn() }))
const source = { kind: 'session' as const, id: endedReportSession().id }
function result() {
  const session = endedReportSession()
  return {
    title: '测试项目',
    notice: '测试来源',
    graph: buildRiskGraph({
      project: session.project,
      analysis: session.analysis,
      session,
      report: reportFixture(),
    }),
  }
}
beforeEach(() => vi.mocked(loadRiskMap).mockReset())
describe('risk map interaction state', () => {
  it('loads, selects actual details and clears a selection on refresh', async () => {
    const value = result()
    vi.mocked(loadRiskMap).mockResolvedValue(value)
    const state = useRiskMap(),
      pending = state.load(source)
    expect(state.status.value).toBe('loading')
    await pending
    expect(state.status.value).toBe('success')
    state.select(value.graph.nodes[0]!.id)
    expect(state.selected.value).toEqual(value.graph.nodes[0])
    state.select('unknown')
    expect(state.selected.value).toBeNull()
    state.select(value.graph.nodes[0]!.id)
    await state.load(source)
    expect(state.selected.value).toBeNull()
  })
  it('filters edges with their nodes and supports empty filter results', async () => {
    vi.mocked(loadRiskMap).mockResolvedValue(result())
    const state = useRiskMap()
    await state.load(source)
    state.levelFilter.value = 'high'
    expect(state.visibleNodes.value.every((node) => node.level === 'high')).toBe(true)
    expect(
      state.visibleEdges.value.every(
        (edge) =>
          state.visibleNodes.value.some((node) => node.id === edge.source) &&
          state.visibleNodes.value.some((node) => node.id === edge.target),
      ),
    ).toBe(true)
    state.levelFilter.value = 'low'
    expect(state.visibleNodes.value).toEqual([])
    expect(state.visibleEdges.value).toEqual([])
  })
  it('shows empty data and failures, rejects malformed data and recovers on retry', async () => {
    const value = result(),
      state = useRiskMap()
    vi.mocked(loadRiskMap).mockResolvedValueOnce({
      ...value,
      graph: { ...value.graph, nodes: [], edges: [] },
    })
    await state.load(source)
    expect(state.status.value).toBe('empty')
    vi.mocked(loadRiskMap).mockRejectedValueOnce(new Error('网络异常'))
    await state.load(source)
    expect(state.status.value).toBe('error')
    expect(state.error.value).toBe('网络异常')
    vi.mocked(loadRiskMap).mockResolvedValueOnce({
      ...value,
      graph: { ...value.graph, edges: [{ ...value.graph.edges[0]!, target: 'missing' }] },
    })
    await state.load(source)
    expect(state.status.value).toBe('error')
    expect(state.graph.value).toBeNull()
    vi.mocked(loadRiskMap).mockResolvedValueOnce(value)
    await state.load(source)
    expect(state.status.value).toBe('success')
  })
  it('cancels waiting on leave, ignores stale responses and initializes after navigation', async () => {
    const value = result(),
      state = useRiskMap()
    let complete!: (value: ReturnType<typeof result>) => void
    vi.mocked(loadRiskMap).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = state.load(source),
      signal = vi.mocked(loadRiskMap).mock.calls[0]![1]!
    state.leave()
    expect(signal.aborted).toBe(true)
    vi.mocked(loadRiskMap).mockResolvedValueOnce(value)
    await state.load({ kind: 'project', id: value.graph.projectId, mode: 'live' })
    complete({ ...value, title: '迟到的旧会话' })
    await pending
    expect(state.title.value).toBe('测试项目')
    expect(state.selected.value).toBeNull()
    expect(state.status.value).toBe('success')
  })
})
