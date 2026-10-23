<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
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
  <RouterLink to="/history" class="back-link focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">← 返回历史记录</RouterLink>
  <div class="view-heading">

    <h1>两次答辩评分对比</h1>
    <p>仅使用同一项目两场实际保存的报告，变化值 = 对比场次 − 基准场次。</p>
    <p>请同时核对训练方式、题数和求助情况，提示辅助后的评分不能直接当作独立作答能力变化。</p>
  </div>
  <StatusNotice v-if="store.error || comparison.error" tone="error" compact>
    {{ store.error || comparison.error }}
  </StatusNotice>
  <StatusNotice v-if="records.length < 2" tone="info" compact>
    至少需要两份已保存的评分报告。完成二次训练并生成新报告后再来对比。
  </StatusNotice>
  <div class="history-compare-select aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
    <label
      >基准场次<select class="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl text-sky-900 placeholder:text-sky-400/50 focus:outline-none focus:border-white/70 focus:bg-white/40 transition-all focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" v-model="beforeId">
        <option value="">请选择历史报告</option>
        <option v-for="entry in records" :key="entry.session.id" :value="entry.session.id">
          {{ label(entry) }}
        </option>
      </select></label
    ><label
      >对比场次<select class="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl text-sky-900 placeholder:text-sky-400/50 focus:outline-none focus:border-white/70 focus:bg-white/40 transition-all focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" v-model="afterId">
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
    <div class="history-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
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
      <RouterLink :to="{ name: 'history-detail', params: { id: beforeId } }" class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
        >查看基准完整依据 →</RouterLink
      ><RouterLink :to="{ name: 'history-detail', params: { id: afterId } }" class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
        >查看对比完整依据 →</RouterLink
      >
    </div></template
  >
</template>
