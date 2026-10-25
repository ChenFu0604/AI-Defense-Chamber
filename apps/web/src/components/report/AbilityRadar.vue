<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { getDimensionAssessment, reportDimensionIds, reportDimensionLabels, type AnyReportDimensions } from '@defense/shared'
import { createRadarChart } from './radar-chart'
import { observeChartAppearance } from '../chart-theme'
const props = defineProps<{ dimensions: AnyReportDimensions }>()
const entries = computed(() => reportDimensionIds.map(id => ({
  id, label: reportDimensionLabels[id], score: props.dimensions[id].score,
  status: getDimensionAssessment(props.dimensions[id]),
})))
const complete = computed(() => entries.value.every(item => item.status !== 'insufficient' && typeof item.score === 'number' && Number.isFinite(item.score)))
const legacy = computed(() => entries.value.some(item => item.status === 'legacy'))
const container = ref<HTMLElement | null>(null)
let chart: ReturnType<typeof createRadarChart> | undefined
let observer: ResizeObserver | undefined
let stopAppearance: (() => void) | undefined
const resize = () => chart?.resize()
onMounted(() => {
  if (!container.value) return
  chart = createRadarChart(container.value)
  chart.update(props.dimensions)
  stopAppearance = observeChartAppearance(() => chart?.update(props.dimensions))
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
  stopAppearance?.()
  window.removeEventListener('resize', resize)
  chart?.dispose()
})
</script>
<template>
  <div class="ability-radar-content">
  <div
    ref="container"
    class="ability-radar"
    role="img"
    :aria-label="!complete ? '五维坐标：存在未充分评估维度，未绘制评分多边形，具体分数见文字列表' : legacy ? '旧版五维评分雷达图，观察覆盖未标注，具体分数见下方分项评分' : '本次答辩五维能力雷达图，具体分数见下方分项评分'"
  />
  <template v-if="!complete">
    <p class="radar-coverage-note">观察不足时暂不绘制评分多边形，避免把缺少的分数当作 0 分。</p>
    <ul class="radar-score-list" aria-label="本场各维度评估情况">
      <li v-for="item in entries" :key="item.id"><span>{{ item.label }}</span><strong v-if="item.score !== null">{{ item.score }} / 100</strong><span v-else class="radar-unassessed">未充分评估</span></li>
    </ul>
  </template>
  <p v-else-if="legacy" class="radar-coverage-note">旧版保存评分 · 当时未记录观察覆盖情况。</p>
  </div>
</template>
<style scoped>
.ability-radar-content { min-width: 0; }
.radar-coverage-note { margin: 0 0 10px; color: var(--text-secondary); font-size: 12px; line-height: 1.8; }
.radar-score-list { display: grid; gap: 6px; padding: 0; margin: 0; list-style: none; }
.radar-score-list li { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; line-height: 1.7; }
.radar-score-list strong { color: var(--text-primary); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; }
.radar-unassessed { color: var(--warning); }
</style>
