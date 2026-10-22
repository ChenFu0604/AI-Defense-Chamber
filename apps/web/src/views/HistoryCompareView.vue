<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { compareHistoryReports, projectInputSchema, reportDimensionLabels } from '@defense/shared'
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
const label = (entry: (typeof records.value)[number]) =>
  `${entry.session.project.name} · ${new Date(entry.session.createdAt).toLocaleString('zh-CN')} · ${entry.report!.overallScore} 分 · ${entry.session.id.slice(0, 8)}`
</script>
<template>
  <RouterLink to="/history" class="back-link">← 返回历史记录</RouterLink>
  <div class="view-heading">
    <div class="eyebrow">COMPARE SAVED RESULTS</div>
    <h1>两次答辩评分对比</h1>
    <p>仅使用同一项目两场实际保存的报告，变化值 = 对比场次 − 基准场次。</p>
    <p>请同时核对训练方式、题数和求助情况，提示辅助后的评分不能直接当作独立作答能力变化。</p>
  </div>
  <p v-if="store.error || comparison.error" role="alert" class="notice notice-error">
    {{ store.error || comparison.error }}
  </p>
  <p v-if="records.length < 2" class="notice">
    至少需要两份已保存的评分报告。完成二次训练并生成新报告后再来对比。
  </p>
  <div class="history-compare-select">
    <label
      >基准场次<select v-model="beforeId">
        <option value="">请选择历史报告</option>
        <option v-for="entry in records" :key="entry.session.id" :value="entry.session.id">
          {{ label(entry) }}
        </option>
      </select></label
    ><label
      >对比场次<select v-model="afterId">
        <option value="">请选择另一份报告</option>
        <option v-for="entry in records" :key="entry.session.id" :value="entry.session.id">
          {{ label(entry) }}
        </option>
      </select></label
    >
  </div>
  <template v-if="comparison.data && before && after"
    ><p class="notice">
      AI 主观训练评分受题目、模型与回答数量影响；分数上升不等于客观能力必然提升。{{
        before.report!.model !== after.report!.model ? '两场所用模型不同，请谨慎解读。' : ''
      }}{{ projectChanged ? '项目资料也有变化。' : '' }}
    </p>
    <div class="history-card">
      <h2>综合分 {{ before.report!.overallScore }} → {{ after.report!.overallScore }}</h2>
      <strong class="history-delta" :class="{ 'positive-text': comparison.data.overall > 0 }"
        >{{ signed(comparison.data.overall) }} 分</strong
      >
      <p>两个综合分均为各场五维等权平均。</p>
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
            <td>{{ item.before }}</td>
            <td>{{ item.after }}</td>
            <td>{{ signed(item.delta) }}</td>
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
