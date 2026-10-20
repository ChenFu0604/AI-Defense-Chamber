import { computed, ref, shallowRef } from 'vue'
import { riskGraphSchema, type RiskGraph } from '@defense/shared'
import { loadRiskMap, type RiskMapSource } from '../services/risk-map-source'

export function useRiskMap() {
  const graph = shallowRef<RiskGraph | null>(null),
    title = ref(''),
    notice = ref(''),
    error = ref('')
  const status = ref<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle')
  const selectedId = ref<string | null>(null)
  const levelFilter = ref<'all' | 'high' | 'medium' | 'low'>('all')
  const selected = computed(
    () => graph.value?.nodes.find((node) => node.id === selectedId.value) ?? null,
  )
  const visibleNodes = computed(
    () =>
      graph.value?.nodes.filter(
        (node) => levelFilter.value === 'all' || node.level === levelFilter.value,
      ) ?? [],
  )
  const visibleEdges = computed(() => {
    const ids = new Set(visibleNodes.value.map((node) => node.id))
    return graph.value?.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) ?? []
  })
  let epoch = 0,
    controller: AbortController | null = null
  function select(id: string | null) {
    selectedId.value = id && graph.value?.nodes.some((node) => node.id === id) ? id : null
  }
  async function load(source: RiskMapSource) {
    controller?.abort()
    const token = ++epoch
    controller = new AbortController()
    graph.value = null
    title.value = ''
    notice.value = ''
    error.value = ''
    selectedId.value = null
    levelFilter.value = 'all'
    status.value = 'loading'
    try {
      const result = await loadRiskMap(source, controller.signal)
      if (token !== epoch) return
      const parsed = riskGraphSchema.safeParse(result.graph)
      if (!parsed.success) throw new Error('风险节点或关联数据无效，未绘制地图，请重新读取。')
      graph.value = parsed.data
      title.value = result.title
      notice.value = result.notice
      status.value = parsed.data.nodes.length ? 'success' : 'empty'
    } catch (failure) {
      if (token !== epoch) return
      error.value = failure instanceof Error ? failure.message : '漏洞地图加载失败，请重试。'
      status.value = 'error'
    } finally {
      if (token === epoch) controller = null
    }
  }
  function leave() {
    epoch++
    controller?.abort()
    controller = null
    graph.value = null
    selectedId.value = null
    status.value = 'idle'
  }
  return {
    graph,
    title,
    notice,
    error,
    status,
    selected,
    selectedId,
    levelFilter,
    visibleNodes,
    visibleEdges,
    select,
    load,
    leave,
  }
}
