<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { ReportDimensions } from '@defense/shared'
import { createRadarChart } from './radar-chart'
const props = defineProps<{ dimensions: ReportDimensions }>()
const container = ref<HTMLElement | null>(null)
let chart: ReturnType<typeof createRadarChart> | undefined
let observer: ResizeObserver | undefined
const resize = () => chart?.resize()
onMounted(() => {
  if (!container.value) return
  chart = createRadarChart(container.value)
  chart.update(props.dimensions)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize)
    observer.observe(container.value)
  }
  window.addEventListener('resize', resize)
})
watch(
  () => props.dimensions,
  (dimensions) => chart?.update(dimensions),
  { deep: true },
)
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', resize)
  chart?.dispose()
})
</script>
<template>
  <div
    ref="container"
    class="ability-radar"
    role="img"
    aria-label="本次答辩五维能力雷达图，具体分数见下方分项评分"
  />
</template>
