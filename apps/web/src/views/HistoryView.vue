<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, onMounted, ref } from 'vue'
import { readPendingCreation, type PendingCreation } from '../services/history-storage'
import { defenseStatusLabels, projectTypeLabels } from '@defense/shared'
import { useHistoryStore } from '../stores/history'
import { downloadHistoryBackup } from '../services/history-service'
import AppButton from '../components/ui/AppButton.vue'
import {
  RefreshCw,
  ArchiveRestore,
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
function backup() {
  try {
    downloadHistoryBackup()
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '导出失败。'
  }
}
const date = (value: string) => new Date(value).toLocaleString('zh-CN')
</script>
<template>
  <div class="view-heading">

    <h1>历史记录与持续训练</h1>
    <p>保存每一场答辩的资料、回答和报告，比较同一项目的变化。</p>
  </div>
  <section class="history-toolbar aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out" aria-label="历史记录工具栏">
      <AeroDecor />
    <div class="history-toolbar-actions">
      <div class="history-tool-group">
        <AppButton variant="secondary" @click="store.load"
          ><RefreshCw :size="15" />刷新本地历史</AppButton
        >
        <AppButton variant="secondary" @click="store.archiveProjects"
          ><ArchiveRestore :size="15" />补存项目与画像</AppButton
        >
        <AppButton variant="secondary" @click="backup"
          ><Download :size="15" />导出本地归档</AppButton
        >
      </div>
      <RouterLink to="/history/compare" class="app-button button-secondary history-compare-link aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
        >
      <AeroDecor :orbs="false" /><ChartNoAxesCombined :size="16" />两次评分对比<ArrowUpRight :size="14"
      /></RouterLink>
    </div>
    <div class="history-toolbar-filter">
      <label class="history-filter"
        ><span><FolderOpen :size="15" />按项目查看</span>
        <select class="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl text-sky-900 placeholder:text-sky-400/50 focus:outline-none focus:border-white/70 focus:bg-white/40 transition-all focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" v-model="projectId">
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
      class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
      >读取该会话 →</RouterLink
    ><RouterLink
      v-if="pending.kind === 'retrain'"
      :to="{ name: 'history-train', params: { id: pending.sourceId } }"
      class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
      >返回原二次训练页安全重试 →</RouterLink
    ><RouterLink
      v-else
      :to="{ name: 'defense', query: { project: pending.input.project.id } }"
      class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
      >返回项目准备页安全重试 →</RouterLink
    >
    </template>
  </StatusNotice>
  <StatusNotice v-if="store.error || exportError" tone="error" compact>
    {{ store.error || exportError }}
  </StatusNotice>
  <StatusNotice v-if="store.warning || store.message" :tone="store.warning ? 'warning' : 'success'" compact>
    {{ store.warning }} {{ store.message }}
  </StatusNotice>
  <div
    v-if="
      !store.error &&
      !store.entries.length &&
      !store.archive.projects.length &&
      !store.legacy.length
    "
    class="empty-state aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out"
  >
      <AeroDecor />
    <h2>还没有训练历史</h2>
    <p>先创建项目，为下一次答辩留下起点。</p>
    <RouterLink to="/projects/new" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />创建第一个项目</RouterLink>
  </div>
  <section class="history-grid">
    <article v-for="entry in entries" :key="entry.session.id" class="history-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
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
        <strong>{{ entry.report ? entry.report.overallScore : '—' }}</strong
        ><span>{{ entry.report ? '本场综合分 / 100' : '本场尚无已保存评分' }}</span
        ><span>{{ defenseStatusLabels[entry.session.status] }}</span>
      </div>
      <div class="defense-actions">
        <RouterLink
          :to="{ name: 'history-detail', params: { id: entry.session.id } }"
          class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          >
      <AeroDecor :orbs="false" />查看历史{{ entry.report ? '报告' : '答辩' }}</RouterLink
        ><RouterLink
          v-if="entry.session.status !== 'ended'"
          :to="{ name: 'defense-session', params: { id: entry.session.id } }"
          class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          >继续训练 →</RouterLink
        ><RouterLink
          v-else-if="entry.report"
          :to="{ name: 'history-train', params: { id: entry.session.id } }"
          class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          >薄弱点二次训练 →</RouterLink
        ><RouterLink
          v-else
          :to="{ name: 'defense-report', params: { id: entry.session.id } }"
          class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          >进入报告生成 →</RouterLink
        >
      </div>
    </article>
  </section>
  <StatusNotice v-if="!entries.length && store.entries.length" tone="info" compact>该项目暂无已归档的答辩记录。</StatusNotice>
  <section v-if="store.archive.projects.length" class="history-projects">
    <h2>项目档案</h2>
    <article v-for="project in store.archive.projects" :key="project.id" class="history-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
      <h3>{{ project.name }}</h3>
      <p>{{ projectTypeLabels[project.projectType] }} · {{ date(project.createdAt) }}</p>
      <p>{{ project.description }}</p>
      <p>
        最近一次已保存综合分：{{
          store.entries.find((entry) => entry.session.project.id === project.id && entry.report)
            ?.report?.overallScore ?? '暂无'
        }}
      </p>
      <RouterLink :to="{ name: 'history-project', params: { id: project.id } }" class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
        >打开项目 →</RouterLink
      >
    </article>
  </section>
  <section v-if="store.legacy.length">
    <h2>旧版会话入口</h2>
    <p>这些入口还没有完整本地快照。只读同步会从后端补齐记录，不生成新报告。</p>
    <article v-for="entry in store.legacy" :key="entry.id" class="history-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
      <h3>{{ entry.name }}</h3>
      <p>{{ entry.mode === 'demo' ? '模拟' : '真实' }} · 尚未同步时间与评分</p>
      <AppButton variant="secondary" :disabled="store.busy" @click="store.sync(entry.id)"
        >只读同步历史记录</AppButton
      ><RouterLink :to="{ name: 'defense-session', params: { id: entry.id } }" class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
        >打开原会话 →</RouterLink
      >
    </article>
  </section>
</template>
