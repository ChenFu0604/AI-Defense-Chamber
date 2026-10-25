<script setup lang="ts">
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { compareHistoryReports, getReportCoverage, projectInputSchema, reportDimensionLabels, type DefenseReport } from '@defense/shared'
import { useHistoryStore } from '../stores/history'
const store = useHistoryStore(),
  route = useRoute()
const beforeId = ref(String(route.query.before ?? '')),
  afterId = ref(String(route.query.after ?? ''))
watch(
  () => route.query,
  (query) => {
    beforeId.value = String(query.before ?? '')
    afterId.value = String(query.after ?? '')
  },
)
onMounted(store.load)
const records = computed(() => store.entries.filter((e) => e.report))
const before = computed(() => records.value.find((e) => e.session.id === beforeId.value)),
  after = computed(() => records.value.find((e) => e.session.id === afterId.value))
const projectChanged = computed(
  () =>
    before.value &&
    after.value &&
    JSON.stringify(projectInputSchema.parse(before.value.session.project)) !==
      JSON.stringify(projectInputSchema.parse(after.value.session.project)),
)
const comparison = computed(() => {
  if (!before.value?.report || !after.value?.report) return { data: null, error: '' }
  try {
    return { data: compareHistoryReports(before.value.report, after.value.report), error: '' }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : '无法对比' }
  }
})
const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
const scoreText = (report: DefenseReport) => report.overallScore === null ? '暂不计算' : `${report.overallScore} 分`
const coverageText = (report: DefenseReport) => {
  const coverage = getReportCoverage(report)
  return coverage.legacy ? '旧版评分 · 观察覆盖未记录' : `已评估 ${coverage.assessed} / ${coverage.total} 维`
}
const unavailableText = (status: 'comparable' | 'insufficient' | 'legacy_mismatch') =>
  status === 'legacy_mismatch' ? '旧版未记录观察状态，不计算变化' : '观察不足，暂不比较'
const label = (entry: (typeof records.value)[number]) =>
  `${entry.session.project.name} · ${new Date(entry.session.createdAt).toLocaleString('zh-CN')} · ${scoreText(entry.report!)} · ${coverageText(entry.report!)} · ${entry.session.id.slice(0, 8)}`
</script>
<template>
  <RouterLink to="/history" class="back-link">← 返回历史记录</RouterLink>
  <div class="view-heading">

    <h1>两次答辩评分对比</h1>
    <p>仅使用同一项目两场实际保存的报告，变化值 = 对比场次 − 基准场次。</p>
    <p>请同时核对训练方式、题数和求助情况，提示辅助后的评分不能直接当作独立作答能力变化。</p>
  </div>
  <StatusNotice v-if="store.error || comparison.error" tone="error" compact>
    {{ store.error || comparison.error }}
  </StatusNotice>
  <StatusNotice v-if="store.loading" busy compact>正在读取已保存报告…</StatusNotice>
  <StatusNotice v-if="records.length < 2 && store.loaded && !store.loading && !store.error" tone="info" compact>
    至少需要两份已保存的评分报告。完成二次训练并生成新报告后再来对比。
  </StatusNotice>
  <div class="history-compare-select surface-panel">

    <label
      >基准场次<select  v-model="beforeId">
        <option value="">请选择历史报告</option>
        <option v-for="entry in records" :key="entry.session.id" :value="entry.session.id">
          {{ label(entry) }}
        </option>
      </select></label
    ><label
      >对比场次<select  v-model="afterId">
        <option value="">请选择另一份报告</option>
        <option v-for="entry in records" :key="entry.session.id" :value="entry.session.id">
          {{ label(entry) }}
        </option>
      </select></label
    >
  </div>
  <template v-if="comparison.data && before && after"
    ><StatusNotice tone="info" compact :announce="false">
      AI 主观训练评分受题目、模型与回答数量影响；分数上升不等于客观能力必然提升。{{
        before.report!.model !== after.report!.model ? '两场所用模型不同，请谨慎解读。' : ''
      }}{{ projectChanged ? '项目资料也有变化。' : '' }}
    </StatusNotice>
    <div class="history-card surface-panel">

      <h2>综合分 {{ scoreText(before.report!) }} → {{ scoreText(after.report!) }}</h2>
      <strong v-if="comparison.data.overall !== null" class="history-delta" :class="{ 'positive-text': comparison.data.overall > 0 }"
        >{{ signed(comparison.data.overall) }} 分</strong>
      <p v-else class="history-comparison-unavailable">{{ unavailableText(comparison.data.overallStatus) }}。未充分评估不代表低分或能力退步。</p>
      <p>基准：{{ coverageText(before.report!) }}；对比：{{ coverageText(after.report!) }}。</p>
      <p v-if="before.report!.version === 1 || after.report!.version === 1">旧版分数按原记录保留，不补认已充分评估；旧版之间的变化仅供回顾。</p>
      <p v-else>只有五个维度均完成评估才计算综合分，各维度等权。分项仅在两场都有评分时计算变化。</p>
    </div>
    <div class="history-table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>评分维度</th>
            <th>基准</th>
            <th>对比</th>
            <th>变化</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in comparison.data.dimensions" :key="item.id">
            <td>{{ reportDimensionLabels[item.id] }}</td>
            <td>{{ item.before === null ? '未充分评估' : item.before }}<small v-if="item.beforeStatus === 'legacy'" class="history-assessment-note">旧版评分</small></td>
            <td>{{ item.after === null ? '未充分评估' : item.after }}<small v-if="item.afterStatus === 'legacy'" class="history-assessment-note">旧版评分</small></td>
            <td>{{ item.delta === null ? unavailableText(item.comparisonStatus) : signed(item.delta) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="defense-actions">
      <RouterLink :to="{ name: 'history-detail', params: { id: beforeId } }" class="text-button"
        >查看基准完整依据 →</RouterLink
      ><RouterLink :to="{ name: 'history-detail', params: { id: afterId } }" class="text-button"
        >查看对比完整依据 →</RouterLink
      >
    </div></template
  >
</template>
