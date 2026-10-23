<script setup lang="ts">
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  buildRiskGraph,
  defenseStatusLabels,
  judgeDefinitions,
  projectTypeLabels,
} from '@defense/shared'
import { useHistoryStore } from '../stores/history'
import ReportResults from '../components/report/ReportResults.vue'
import DefenseMessages from '../components/defense/DefenseMessages.vue'
import AnalysisResults from '../components/analysis/AnalysisResults.vue'
import AppButton from '../components/ui/AppButton.vue'
import AttachmentGallery from '../components/attachments/AttachmentGallery.vue'
import ProjectSnapshot from '../components/ProjectSnapshot.vue'
import TrainingSummary from '../components/defense/TrainingSummary.vue'
import AnswerFeedback from '../components/defense/AnswerFeedback.vue'
import DiscussionBoard from '../components/defense/DiscussionBoard.vue'
import DiscussionSummary from '../components/defense/DiscussionSummary.vue'
const route = useRoute(),
  store = useHistoryStore()
const id = computed(() => String(route.params.id)),
  entry = computed(() => store.archive.entries.find((item) => item.session.id === id.value))
const judges = computed(() => {
  const messages = entry.value?.session.messages ?? []
  return (
    judgeDefinitions
      .filter((j) => messages.some((m) => m.judgeId === j.id))
      .map((j) => j.name)
      .join('、') || '尚无提问'
  )
})
const risks = computed(() => {
  if (!entry.value) return null
  try {
    const { session, report } = entry.value
    return buildRiskGraph({ project: session.project, analysis: session.analysis, session, report })
  } catch {
    return null
  }
})
onMounted(store.load)
watch(id, store.load)
</script>
<template>
  <RouterLink to="/history" class="back-link">← 返回历史记录</RouterLink>
  <div class="view-heading">

    <h1>历史答辩与报告</h1>
    <p>读取本地保存的记录，附件预览从本机后端加载；不重新调用模型。</p>
  </div>
  <StatusNotice v-if="store.error" tone="error" compact>{{ store.error }}</StatusNotice>
  <template v-else-if="entry">
    <TrainingSummary :session="entry.session" />
    <DiscussionSummary v-if="entry.session.status === 'ended'" :session="entry.session" />
    <DiscussionBoard :session="entry.session" read-only />
    <div class="history-card surface-panel">

      <h2>{{ entry.session.project.name }}</h2>
      <p>
        {{ projectTypeLabels[entry.session.project.projectType] }} ·
        {{ new Date(entry.session.createdAt).toLocaleString('zh-CN') }} ·
        {{ defenseStatusLabels[entry.session.status] }}
      </p>
      <p>
        最后归档：{{ new Date(entry.archivedAt).toLocaleString('zh-CN') }} ·
        {{ entry.session.mode === 'demo' ? '模拟会话' : '真实会话' }}
      </p>
      <p>出现过的评委：{{ judges }}</p>
      <div class="defense-actions">
        <RouterLink
          v-if="entry.session.status !== 'ended'"
          :to="{ name: 'defense-session', params: { id } }"
          class="app-button button-primary control-button"
          >
      继续原会话</RouterLink
        ><RouterLink
          v-if="entry.report"
          :to="{ name: 'history-train', params: { id } }"
          class="app-button button-primary control-button"
          >
      根据薄弱点重新训练</RouterLink
        ><RouterLink
          v-if="entry.report"
          :to="{ name: 'history-compare', query: { before: id } }"
          class="app-button button-secondary control-button"
          >
      与另一场评分对比</RouterLink
        ><AppButton variant="ghost" :disabled="store.busy" @click="store.sync(id)"
          >只读同步后端快照</AppButton
        >
      </div>
    </div>
    <StatusNotice v-if="store.message" tone="success" compact>{{ store.message }}</StatusNotice>
    <details class="history-card surface-panel">
      <summary >当时的项目资料与分析</summary>

      <h3>{{ entry.session.project.name }}</h3>
      <ProjectSnapshot :project="entry.session.project" />
      <AttachmentGallery
        v-if="entry.session.project.attachments?.length"
        :items="entry.session.project.attachments"
      />
      <AnalysisResults :record="entry.session.analysis" />
    </details>
    <ReportResults v-if="entry.report" :report="entry.report" :messages="entry.session.messages" />
    <StatusNotice v-else tone="info" compact :announce="false">
      此快照没有评分报告，不补造评分。
      <template #actions><RouterLink
        v-if="entry.session.status === 'ended' && entry.session.mode === 'live'"
        :to="{ name: 'defense-report', params: { id } }"
        class="text-button"
        >进入报告页面生成或读取 →</RouterLink
      ></template>
    </StatusNotice>
    <section class="history-card surface-panel">

      <h2>当时发现的项目风险</h2>
      <p v-if="risks">{{ risks.nodes.length }} 个风险或证据缺口，属于原记录中的评价。</p>
      <article v-for="node in risks?.nodes" :key="node.id">
        <h3>{{ node.name }}</h3>
        <p>{{ node.description }}</p>
        <p v-for="suggestion in node.suggestions" :key="suggestion">建议：{{ suggestion }}</p>
      </article>
      <p v-if="!risks">风险来源校验未通过，保留原记录，未补造节点。</p>
      <p v-else-if="!risks.nodes.length">原记录未发现可整理风险，不能据此推断项目没有风险。</p>
    </section>
    <h2>完整答辩消息</h2>
    <AnswerFeedback v-if="entry.session.closingFeedback" :assessment="entry.session.closingFeedback.assessment" :demo="entry.session.mode === 'demo'" />
    <DefenseMessages :messages="entry.session.messages" :demo="entry.session.mode === 'demo'" :assistance="entry.session.assistance" />
  </template>
  <div v-else class="empty-state surface-panel">

    <h2>尚未找到本地完整历史</h2>
    <p>可返回历史列表，从旧版会话入口只读同步。原后端记录不会因本地缺失被删除。</p>
    <RouterLink to="/history" class="app-button button-primary control-button">
      返回历史列表</RouterLink>
  </div>
</template>
