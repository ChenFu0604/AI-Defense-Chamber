<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { readPendingCreation, type PendingCreation } from '../services/history-storage'
import { defenseStatusLabels, projectTypeLabels } from '@defense/shared'
import { useHistoryStore } from '../stores/history'
import { downloadHistoryBackup } from '../services/history-service'
import AppButton from '../components/ui/AppButton.vue'
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
    <div class="eyebrow">KEEP YOUR PROGRESS</div>
    <h1>历史记录与持续训练</h1>
    <p>保存每一场答辩的资料、回答和报告，比较同一项目的变化。</p>
  </div>
  <div class="defense-actions">
    <AppButton variant="secondary" @click="store.load">刷新本地历史</AppButton
    ><AppButton variant="secondary" @click="store.archiveProjects">补存已有项目与画像</AppButton
    ><AppButton variant="ghost" @click="backup">导出本地归档</AppButton
    ><RouterLink to="/history/compare" class="app-button button-secondary"
      >两次评分对比 →</RouterLink
    >
  </div>
  <p class="notice">
    历史页面只读已保存快照，不重新调用模型。归档限当前浏览器，最多 3
    MiB；不会自动清理旧记录。正在进行的会话继续保存在后端，草稿保存在本地。
  </p>
  <p v-if="pending" class="notice">
    上一次创建结果尚待确认。<RouterLink
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
  </p>
  <p v-if="store.error || exportError" role="alert" class="notice notice-error">
    {{ store.error || exportError }}
  </p>
  <p v-if="store.warning || store.message" role="status" class="notice">
    {{ store.warning }} {{ store.message }}
  </p>
  <label class="history-filter"
    >按项目查看
    <select v-model="projectId">
      <option value="">全部项目</option>
      <option v-for="project in store.archive.projects" :key="project.id" :value="project.id">
        {{ project.name }}
      </option>
    </select></label
  >
  <div
    v-if="
      !store.error &&
      !store.entries.length &&
      !store.archive.projects.length &&
      !store.legacy.length
    "
    class="empty-state"
  >
    <h2>还没有训练历史</h2>
    <p>先创建项目，为下一次答辩留下起点。</p>
    <RouterLink to="/projects/new" class="app-button button-primary">创建第一个项目</RouterLink>
  </div>
  <section class="history-grid">
    <article v-for="entry in entries" :key="entry.session.id" class="history-card">
      <span class="section-kicker">{{
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
          class="app-button button-secondary"
          >查看历史{{ entry.report ? '报告' : '答辩' }}</RouterLink
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
  <p v-if="!entries.length && store.entries.length" class="notice">该项目暂无已归档的答辩记录。</p>
  <section v-if="store.archive.projects.length" class="history-projects">
    <h2>项目档案</h2>
    <article v-for="project in store.archive.projects" :key="project.id" class="history-card">
      <h3>{{ project.name }}</h3>
      <p>{{ projectTypeLabels[project.projectType] }} · {{ date(project.createdAt) }}</p>
      <p>{{ project.description }}</p>
      <p>
        最近一次已保存综合分：{{
          store.entries.find((entry) => entry.session.project.id === project.id && entry.report)
            ?.report?.overallScore ?? '暂无'
        }}
      </p>
      <RouterLink :to="{ name: 'history-project', params: { id: project.id } }" class="text-button"
        >打开项目 →</RouterLink
      >
    </article>
  </section>
  <section v-if="store.legacy.length">
    <h2>旧版会话入口</h2>
    <p>这些入口还没有完整本地快照。只读同步会从后端补齐记录，不生成新报告。</p>
    <article v-for="entry in store.legacy" :key="entry.id" class="history-card">
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
