<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { answerEvaluationLabels } from '@defense/shared'
import { useDefenseStore } from '../stores/defense'
import { useReportStore } from '../stores/report'
import AppButton from '../components/ui/AppButton.vue'
import ReportResults from '../components/report/ReportResults.vue'
import DefenseMessages from '../components/defense/DefenseMessages.vue'
const route = useRoute(),
  store = useDefenseStore(),
  reports = useReportStore()
const id = computed(() => String(route.params.id ?? ''))
async function loadPage(value = id.value) {
  reports.leave()
  await store.load(value)
  if (
    id.value === value &&
    !store.error &&
    store.session?.status === 'ended' &&
    store.session.mode === 'live'
  )
    await reports.load(value)
}
watch(id, (value) => void loadPage(value), { immediate: true })
onBeforeUnmount(() => {
  store.leave()
  reports.leave()
})
const assessments = computed(() => store.session?.messages.filter((v) => v.assessment) ?? [])
const answers = computed(
  () => store.session?.messages.filter((v) => v.sender === 'user').length ?? 0,
)
</script>
<template>
  <RouterLink :to="{ name: 'defense-session', params: { id } }" class="back-link"
    >← 查看答辩会话</RouterLink
  >
  <div class="view-heading">
    <div class="eyebrow">REVIEW YOUR REASONING</div>
    <h1>答辩诊断报告</h1>
    <p>从实际回答出发，识别优势、证据缺口与下一步改进方向。</p>
  </div>
  <p v-if="store.error" role="alert" class="notice notice-error">
    {{ store.error }} <button @click="loadPage()">重试读取</button>
  </p>
  <p v-if="store.busy" role="status">正在读取记录…</p>
  <template v-if="store.session?.status === 'ended'">
    <div class="defense-session-bar">
      <strong>{{ store.session.project.name }}</strong
      ><span>{{
        store.session.mode === 'demo' ? '模拟诊断 · 未调用模型' : '真实答辩记录 · AI 主观训练建议'
      }}</span
      ><span>已保存 {{ answers }} 次回答</span>
    </div>
    <p class="notice">逐轮反馈仅展示已保存结果；评分报告依据本次实际回答生成，不能替代外部核验。</p>
    <div class="defense-actions">
      <RouterLink
        :to="{ name: 'session-risks', params: { id } }"
        class="app-button button-secondary"
        >查看本场答辩漏洞地图 →</RouterLink
      >
    </div>
    <template v-if="store.session.mode === 'live'">
      <p v-if="reports.status === 'loading'" class="notice" role="status">正在读取历史评分报告…</p>
      <div
        v-if="reports.status === 'generating'"
        class="report-card"
        role="status"
        aria-live="polite"
      >
        <h2>正在生成诊断报告…</h2>
        <p>正在评价真实回答、核对评分范围与原文引用，完成保存后展示。等待期间可查看下方问答。</p>
      </div>
      <div v-if="reports.status === 'missing'" class="report-card">
        <h2>这场答辩还没有评分报告</h2>
        <p>
          生成会把项目背景和已保存的问答发送至服务端配置的模型，可能消耗模型额度。成功后保存在后端，重新打开会直接读取。
        </p>
        <AppButton :disabled="answers === 0" @click="reports.generate(id)">生成评分报告</AppButton>
        <p v-if="answers === 0">尚无回答，无法生成评分。可以查看完整答辩记录。</p>
      </div>
      <div v-if="reports.error" role="alert" class="notice notice-error">
        <p>{{ reports.error }}</p>
        <div class="defense-actions">
          <AppButton variant="secondary" @click="reports.load(id)">重新读取报告</AppButton>
          <AppButton
            v-if="
              ![
                'REPORT_EMPTY_SESSION',
                'SESSION_NOT_FOUND',
                'REPORT_SOURCE_MISMATCH',
                'REPORT_STORAGE_CORRUPT',
              ].includes(reports.errorCode)
            "
            @click="reports.generate(id)"
            >重试生成</AppButton
          >
          <RouterLink to="/settings" class="text-button">模型设置 →</RouterLink>
        </div>
      </div>
      <ReportResults
        v-if="reports.report?.sessionId === id"
        :report="reports.report"
        :messages="store.session.messages"
      />
    </template>
    <p v-else class="notice">模拟会话不生成真实评分或能力雷达图；以下保留模拟问答与逐轮反馈。</p>
    <h2 class="report-history-heading">逐轮反馈</h2>
    <div v-for="entry in assessments" :key="entry.id" class="defense-report-finding">
      <h3>{{ answerEvaluationLabels[entry.assessment!.evaluation] }}</h3>
      <p>回答依据：「{{ entry.assessment!.answerQuote }}」</p>
      <p>{{ entry.assessment!.feedback }}</p>
      <p v-for="risk in entry.assessment!.risks" :key="risk.title" class="defense-source">
        待验证风险（{{ risk.severity }}）：{{ risk.title }}
      </p>
    </div>
    <p v-if="!assessments.length" class="notice">尚无成功保存的回答分析，可以查看完整问答记录。</p>
    <h2>完整答辩记录</h2>
    <DefenseMessages :messages="store.session.messages" :demo="store.session.mode === 'demo'" />
  </template>
  <p v-else-if="store.session" class="notice">会话尚未结束，请返回会话结束答辩后查看报告。</p>
</template>
