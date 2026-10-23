<script setup lang="ts">
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { answerEvaluationLabels } from '@defense/shared'
import { useDefenseStore } from '../stores/defense'
import { useReportStore } from '../stores/report'
import AppButton from '../components/ui/AppButton.vue'
import ReportResults from '../components/report/ReportResults.vue'
import DefenseMessages from '../components/defense/DefenseMessages.vue'
import TrainingSummary from '../components/defense/TrainingSummary.vue'
import AnswerFeedback from '../components/defense/AnswerFeedback.vue'
import DiscussionSummary from '../components/defense/DiscussionSummary.vue'
import RequestWait from '../components/ui/RequestWait.vue'
const route = useRoute(),
  store = useDefenseStore(),
  reports = useReportStore()
const id = computed(() => String(route.params.id ?? ''))
let active = true
async function loadPage(value = id.value) {
  reports.leave()
  await store.load(value)
  if (
    active &&
    id.value === value &&
    store.session?.id === value &&
    !store.error &&
    store.session?.status === 'ended' &&
    store.session.mode === 'live'
  )
    await reports.load(value)
}
watch(id, (value) => void loadPage(value), { immediate: true })
onBeforeUnmount(() => {
  active = false
  store.leave()
  reports.leave()
})
const assessments = computed(() => store.session?.messages.filter((v) => v.assessment) ?? [])
const answers = computed(
  () => store.session?.messages.filter((v) => v.sender === 'user').length ?? 0,
)
</script>
<template>
  <div class="report-page">
  <RouterLink :to="{ name: 'defense-session', params: { id } }" class="back-link"
    >← 查看答辩会话</RouterLink
  >
  <div class="view-heading">

    <h1>答辩诊断报告</h1>
    <p>从实际回答出发，识别优势、证据缺口与下一步改进方向。</p>
  </div>
  <StatusNotice v-if="store.error" tone="error" title="记录读取未完成" compact>
    {{ store.error }}
    <template #actions><AppButton variant="secondary" @click="loadPage()">重试读取</AppButton></template>
  </StatusNotice>
  <StatusNotice v-if="store.busy" busy compact>正在读取记录…</StatusNotice>
  <StatusNotice v-if="store.warning || reports.warning" tone="warning" compact>
    {{ store.warning || reports.warning }}
  </StatusNotice>
  <template v-if="store.session?.status === 'ended'">
    <div class="defense-session-bar">
      <strong>{{ store.session.project.name }}</strong
      ><span>{{
        store.session.mode === 'demo' ? '模拟诊断 · 未调用模型' : '真实答辩记录 · AI 主观训练建议'
      }}</span
      ><span>已保存 {{ answers }} 次回答</span>
    </div>
    <nav class="page-section-nav" aria-label="报告内容导航">
      <a href="#report-evaluation">评分与建议</a>
      <a href="#report-training">本轮练习</a>
      <a href="#report-feedback">逐轮反馈</a>
      <a href="#report-transcript">完整记录</a>
    </nav>
    <div class="report-next-actions surface-panel">

      <div><strong>把反馈带到下一步</strong><p>先看改进建议，再查看风险或开始新的练习。</p></div>
      <div class="defense-actions">
      <RouterLink
        :to="{ name: 'history-detail', params: { id } }"
        class="app-button button-secondary control-button"
        >
      本地历史与二次训练 →</RouterLink
      >
      <RouterLink
        :to="{ name: 'session-risks', params: { id } }"
        class="app-button button-secondary control-button"
        >
      查看本场答辩漏洞地图 →</RouterLink
      >
    </div>
    </div>
    <section id="report-evaluation" aria-label="评分与改进建议">
    <template v-if="store.session.mode === 'live'">
      <StatusNotice v-if="reports.status === 'loading'" busy compact>正在读取历史评分报告…</StatusNotice>
      <RequestWait :active="reports.status === 'generating'" :request-key="id" label="正在生成诊断报告"
        description="正在评价真实回答、核对评分范围与原文引用，完成保存后展示。等待期间可查看下方问答。" />
      <div v-if="reports.status === 'missing'" class="report-card surface-panel">

        <h2>这场答辩还没有评分报告</h2>
        <p>
          生成会把项目背景和已保存的问答发送至服务端配置的模型，可能消耗模型额度。成功后保存在后端，重新打开会直接读取。
        </p>
        <AppButton :disabled="answers === 0" @click="reports.generate(id)">生成评分报告</AppButton>
        <p v-if="answers === 0">尚无回答，无法生成评分。可以查看完整答辩记录。</p>
      </div>
      <StatusNotice v-if="reports.error" tone="error" title="本次报告操作未完成">
        {{ reports.error }}
        <template #actions>
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
        </template>
      </StatusNotice>
      <ReportResults
        v-if="reports.report?.sessionId === id"
        :report="reports.report"
        :messages="store.session.messages"
      />
    </template>
    <StatusNotice v-else tone="info" compact :announce="false">模拟会话不生成真实评分或能力雷达图；以下保留模拟问答与逐轮反馈。</StatusNotice>
    </section>
    <section id="report-training" class="report-training-section surface-panel" aria-labelledby="report-training-heading">

      <div class="section-heading"><h2 id="report-training-heading">这次练习回顾</h2><a href="#report-evaluation" class="text-button">返回评分 ↑</a></div>
      <TrainingSummary :session="store.session" />
      <DiscussionSummary :session="store.session" />
    </section>
    <section id="report-feedback" aria-labelledby="report-feedback-heading">
    <h2 id="report-feedback-heading" class="report-history-heading">逐轮反馈</h2>
    <div v-for="entry in assessments" :key="entry.id" class="defense-report-finding surface-panel">

      <h3>{{ answerEvaluationLabels[entry.assessment!.evaluation] }}</h3>
      <p>回答依据：「{{ entry.assessment!.answerQuote }}」</p>
      <p>{{ entry.assessment!.feedback }}</p>
      <p v-for="risk in entry.assessment!.risks" :key="risk.title" class="defense-source">
        待验证风险（{{ risk.severity }}）：{{ risk.title }}
      </p>
    </div>
    <StatusNotice v-if="!assessments.length && !store.session.closingFeedback" tone="info" compact>尚无成功保存的回答分析，可以查看完整问答记录。</StatusNotice>
    <AnswerFeedback v-if="store.session.closingFeedback" :assessment="store.session.closingFeedback.assessment" :demo="store.session.mode === 'demo'" />
    </section>
    <section id="report-transcript" aria-labelledby="report-transcript-heading">
    <div class="section-heading"><h2 id="report-transcript-heading">完整答辩记录</h2><span class="section-meta">{{ answers }} 次回答 · 按时间顺序</span></div>
    <DefenseMessages :messages="store.session.messages" :demo="store.session.mode === 'demo'" :assistance="store.session.assistance" />
    </section>
  </template>
  <StatusNotice v-else-if="store.session" tone="info" compact>会话尚未结束，请返回会话结束答辩后查看报告。</StatusNotice>
  </div>
</template>
