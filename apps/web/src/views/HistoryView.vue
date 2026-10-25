<script setup lang="ts">
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, onMounted, ref } from 'vue'
import { readPendingCreation, type PendingCreation } from '../services/history-storage'
import { defenseStatusLabels, getReportCoverage, projectTypeLabels, type DefenseReport } from '@defense/shared'
import { useHistoryStore } from '../stores/history'
import { downloadHistoryBackup } from '../services/history-service'
import AppButton from '../components/ui/AppButton.vue'
import {
  RefreshCw,
  Download,
  ChartNoAxesCombined,
  ArrowUpRight,
  FolderOpen,
} from 'lucide-vue-next'
const store = useHistoryStore(),
  projectId = ref(''),
  exportError = ref('')
const pending = ref<PendingCreation | null>(null)
onMounted(() => {
  store.load()
  try {
    pending.value = readPendingCreation()
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '待创建记录读取失败。'
  }
})
const entries = computed(() =>
  store.entries.filter((entry) => !projectId.value || entry.session.project.id === projectId.value),
)
const exporting = ref(false)
async function backup() {
  if (exporting.value) return
  exporting.value = true
  try {
    await downloadHistoryBackup()
    exportError.value = ''
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '导出失败。'
  } finally { exporting.value = false }
}
const date = (value: string) => new Date(value).toLocaleString('zh-CN')
const coverageText = (report: DefenseReport) => {
  const coverage = getReportCoverage(report)
  return coverage.legacy ? '旧版评分 · 观察覆盖未记录' : `已评估 ${coverage.assessed} / ${coverage.total} 维`
}
function latestReportText(id: string) {
  const report = store.entries.find((entry) => entry.session.project.id === id && entry.report)?.report
  if (!report) return '暂无已保存报告'
  return `${report.overallScore === null ? '观察不足，暂不计算综合分' : report.overallScore + ' 分'} · ${coverageText(report)}`
}
</script>
<template>
  <div class="view-heading">

    <h1>历史记录与持续训练</h1>
    <p>保存每一场答辩的资料、回答和报告，比较同一项目的变化。</p>
  </div>
  <section class="history-toolbar surface-panel" aria-label="历史记录工具栏">

    <div class="history-toolbar-actions">
      <div class="history-tool-group">
        <AppButton variant="secondary" :disabled="store.loading" @click="store.load"
          ><RefreshCw :size="15" />刷新训练记录</AppButton
        >
        <AppButton variant="secondary" :disabled="exporting" :busy="exporting" @click="backup"
          ><Download :size="15" />导出历史记录</AppButton
        >
      </div>
      <RouterLink to="/history/compare" class="app-button button-secondary history-compare-link control-button"
        >
      <ChartNoAxesCombined :size="16" />两次评分对比<ArrowUpRight :size="14"
      /></RouterLink>
    </div>
    <div class="history-toolbar-filter">
      <label class="history-filter"
        ><span><FolderOpen :size="15" />按项目查看</span>
        <select  v-model="projectId">
          <option value="">全部项目</option>
          <option v-for="project in store.archive.projects" :key="project.id" :value="project.id">
            {{ project.name }}
          </option>
        </select>
      </label>
      <span v-if="!store.error" class="history-record-count"
        >{{ projectId ? '当前项目' : '全部项目' }}<i />{{ entries.length }} 条答辩记录</span
      >
    </div>
  </section>
  <StatusNotice v-if="pending" tone="warning" title="上一次创建结果尚待确认" compact>
    <template #actions>
    <RouterLink
      :to="{ name: 'defense-session', params: { id: pending.input.requestId } }"
      class="text-button"
      >读取该会话 →</RouterLink
    ><RouterLink
      v-if="pending.kind === 'retrain'"
      :to="{ name: 'history-train', params: { id: pending.sourceId } }"
      class="text-button"
      >返回原二次训练页安全重试 →</RouterLink
    ><RouterLink
      v-else
      :to="{ name: 'defense', query: { project: pending.input.project.id } }"
      class="text-button"
      >返回项目准备页安全重试 →</RouterLink
    >
    </template>
  </StatusNotice>
  <StatusNotice v-if="store.error || exportError" tone="error" compact>
    {{ store.error || exportError }}
  </StatusNotice>
  <StatusNotice v-if="store.loading" busy compact>正在读取服务端历史…</StatusNotice>
  <StatusNotice v-if="store.warning || store.message" :tone="store.warning ? 'warning' : 'success'" compact>
    {{ store.warning }} {{ store.message }}
  </StatusNotice>
  <div
    v-if="
      !store.error && !store.loading && store.loaded &&
      !store.entries.length &&
      !store.archive.projects.length &&
      !store.legacy.length
    "
    class="empty-state surface-panel"
  >

    <h2>还没有训练历史</h2>
    <p>先创建项目，为下一次答辩留下起点。</p>
    <RouterLink to="/projects/new" class="app-button button-primary control-button">
      创建第一个项目</RouterLink>
  </div>
  <section class="history-grid">
    <article v-for="entry in entries" :key="entry.session.id" class="history-card surface-panel">

      <span class="library-tag">{{
        entry.session.mode === 'demo'
          ? '模拟会话 · 无真实评分'
          : entry.session.training
            ? '二次训练'
            : '答辩记录'
      }}</span>
      <h2>{{ entry.session.project.name }}</h2>
      <p>
        {{ projectTypeLabels[entry.session.project.projectType] }} ·
        {{ date(entry.session.createdAt) }}
      </p>
      <div class="history-score">
        <strong>{{ entry.report?.overallScore ?? '—' }}</strong
        ><span>{{ entry.report ? entry.report.overallScore === null ? '观察不足 · 暂不计算综合分' : '本场综合分 / 100' : '本场尚无已保存评分' }}</span
        ><span v-if="entry.report">{{ coverageText(entry.report) }}</span
        ><span>{{ defenseStatusLabels[entry.session.status] }}</span>
      </div>
      <div class="defense-actions">
        <RouterLink
          :to="{ name: 'history-detail', params: { id: entry.session.id } }"
          class="app-button button-secondary control-button"
          >
      查看历史{{ entry.report ? '报告' : '答辩' }}</RouterLink
        ><RouterLink
          v-if="entry.session.status !== 'ended'"
          :to="{ name: 'defense-session', params: { id: entry.session.id } }"
          class="text-button"
          >继续训练 →</RouterLink
        ><RouterLink
          v-else-if="entry.report"
          :to="{ name: 'history-train', params: { id: entry.session.id } }"
          class="text-button"
          >薄弱点二次训练 →</RouterLink
        ><RouterLink
          v-else
          :to="{ name: 'defense-report', params: { id: entry.session.id } }"
          class="text-button"
          >进入报告生成 →</RouterLink
        >
      </div>
    </article>
  </section>
  <StatusNotice v-if="!entries.length && store.entries.length" tone="info" compact>该项目暂无已归档的答辩记录。</StatusNotice>
  <section v-if="store.archive.projects.length" class="history-projects">
    <h2>项目档案</h2>
    <article v-for="project in store.archive.projects" :key="project.id" class="history-card surface-panel">

      <h3>{{ project.name }}</h3>
      <p>{{ projectTypeLabels[project.projectType] }} · {{ date(project.createdAt) }}</p>
      <p>{{ project.description }}</p>
      <p>
        最近一次已保存报告：{{ latestReportText(project.id) }}
      </p>
      <RouterLink :to="{ name: 'history-project', params: { id: project.id } }" class="text-button"
        >打开项目 →</RouterLink
      >
    </article>
  </section>
  <section v-if="store.legacy.length">
    <h2>旧版会话入口</h2>
    <p>这些旧入口尚未导入。读取服务端原记录不会生成新报告。</p>
    <article v-for="entry in store.legacy" :key="entry.id" class="history-card surface-panel">

      <h3>{{ entry.name }}</h3>
      <p>{{ entry.mode === 'demo' ? '模拟' : '真实' }} · 尚未同步时间与评分</p>
      <AppButton variant="secondary" :disabled="store.busy" @click="store.sync(entry.id)"
        >只读同步历史记录</AppButton
      ><RouterLink :to="{ name: 'defense-session', params: { id: entry.id } }" class="text-button"
        >打开原会话 →</RouterLink
      >
    </article>
  </section>
</template>
