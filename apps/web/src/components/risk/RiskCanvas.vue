<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { VueFlow, useVueFlow, type NodeMouseEvent, type EdgeMouseEvent } from '@vue-flow/core'
import type { RiskGraph } from '@defense/shared'
import { buildFlowElements } from './risk-layout'
import RiskNodeCard from './RiskNodeCard.vue'
import { observeChartAppearance } from '../chart-theme'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
const props = defineProps<{ graph: RiskGraph; selectedId: string | null }>()
const emit = defineEmits<{ select: [id: string | null]; edge: [id: string] }>()
const elements = buildFlowElements(props.graph, props.selectedId)
const nodes = shallowRef(elements.nodes),
  edges = shallowRef(elements.edges)
let stopAppearance: (() => void) | undefined
onMounted(() => {
  const updateColors = () => {
    // Updating only the edges retains the user's dragged node positions and selection.
    edges.value = buildFlowElements(props.graph, props.selectedId).edges
  }
  updateColors()
  stopAppearance = observeChartAppearance(updateColors)
})
onBeforeUnmount(() => stopAppearance?.())
// Component-scoped store: Vue Flow disposes it when the canvas unmounts.
const { fitView, zoomIn, zoomOut, setViewport, dimensions } = useVueFlow()
watch(
  () => dimensions.value.width,
  () => reset(),
  { flush: 'post' },
)
watch(
  () => props.selectedId,
  (id) => {
    nodes.value = nodes.value.map((node) => ({ ...node, selected: node.id === id }))
  },
)
watch(
  () => props.graph,
  (graph) => {
    const fresh = buildFlowElements(graph, props.selectedId)
    nodes.value = fresh.nodes
    edges.value = fresh.edges
  },
)
function clickNode(event: NodeMouseEvent) {
  emit('select', event.node.id)
}
function clickEdge(event: EdgeMouseEvent) {
  emit('edge', event.edge.id)
}
function reset() {
  void fitView({ padding: 0.2, maxZoom: 1 })
}
</script>
<template>
  <div class="risk-canvas" aria-label="项目风险关系画布">
    <VueFlow
      v-model:nodes="nodes"
      :edges="edges"
      :min-zoom="0.15"
      :max-zoom="2"
      :nodes-connectable="false"
      :edges-updatable="false"
      :delete-key-code="null"
      :zoom-on-scroll="false"
      :pan-on-scroll="false"
      :zoom-on-pinch="true"
      :zoom-on-double-click="false"
      fit-view-on-init
      @nodes-initialized="reset"
      @node-click="clickNode"
      @edge-click="clickEdge"
      @pane-click="emit('select', null)"
    >
      <template #node-risk="nodeProps"><RiskNodeCard v-bind="nodeProps" /></template>
    </VueFlow>
    <div class="risk-canvas-controls" aria-label="画布控制">
      <button class="control-button" type="button" aria-label="放大风险地图" @click="zoomIn()">
      ＋</button>
      <button class="control-button" type="button" aria-label="缩小风险地图" @click="zoomOut()">
      −</button>
      <button class="control-button" type="button" @click="reset">
      适应画布</button>
      <button class="control-button" type="button" @click="setViewport({ x: 20, y: 20, zoom: 1 })">
      原始比例</button>
    </div>
    <p class="risk-canvas-tip">拖动画布移动 · 拖动节点调整位置 · 使用按钮或触控缩放</p>
  </div>
</template>
