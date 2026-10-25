<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Download, ListChecks, RotateCcw, ShieldCheck } from 'lucide-vue-next'
import { improvementStatusLabels } from '@defense/shared'
import { useImprovementsStore } from '../stores/improvements'
import { useProjectsStore } from '../stores/projects'
import ImprovementTaskCard from '../components/improvements/ImprovementTaskCard.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
import AppButton from '../components/ui/AppButton.vue'
import { downloadImprovementBackup } from '../services/improvement-storage'
const tasks = useImprovementsStore(), projects = useProjectsStore(), route = useRoute()
const status = ref('')
const backupError = ref('')
function backup() {
  try { downloadImprovementBackup(); backupError.value = '' }
  catch (failure) { backupError.value = failure instanceof Error ? failure.message : '任务导出失败。' }
}
const projectId = computed(() => String(route.query.project ?? ''))
const projectOptions = computed(() => [...new Map([
  ...tasks.tasks.map(t => [t.projectId, t.projectName] as const), ...projects.projects.map(p => [p.id, p.name] as const),
]).entries()])
const filtered = computed(() => tasks.tasks.filter(t => (!projectId.value || t.projectId === projectId.value) && (!status.value || t.status === status.value)))
</script>
<template>
  <div class="improvement-page">
    <div class="view-heading"><h1>项目改进任务</h1><p>把报告建议变成下一步行动，记录进展与证据，再通过答辩检验。任务保存在当前浏览器。</p></div>
    <StatusNotice v-if="tasks.error || backupError" tone="error" compact>{{ tasks.error || backupError }}<template #actions><AppButton variant="secondary" @click="tasks.load">重新读取</AppButton></template></StatusNotice>
    <section class="improvement-filters surface-panel" aria-label="筛选改进任务">
      <label for="improvement-project-filter">选择项目<select id="improvement-project-filter" :value="projectId" @change="$router.replace({query: {...route.query, project: ($event.target as HTMLSelectElement).value || undefined}})"><option value="">全部项目</option><option v-for="[id, name] in projectOptions" :key="id" :value="id">{{ name }}</option></select></label>
      <label for="improvement-status-filter">进展状态<select id="improvement-status-filter" v-model="status"><option value="">全部状态</option><option v-for="(label, key) in improvementStatusLabels" :key="key" :value="key">{{ label }}</option></select></label>
      <div class="improvement-filter-actions">
        <span class="improvement-filter-count" role="status"><ListChecks :size="16" aria-hidden="true" /><span><strong>{{ filtered.length }}</strong> 项任务</span></span>
        <AppButton variant="secondary" @click="backup"><Download :size="15" />导出任务记录</AppButton>
        <AppButton v-if="projectId || status" variant="ghost" aria-label="清除项目和状态筛选" @click="status = ''; $router.replace({query: {...route.query, project: undefined}})"><RotateCcw :size="14" />重置筛选</AppButton>
      </div>
      <div class="improvement-filter-note"><ShieldCheck :size="16" aria-hidden="true" /><p>完成状态由你记录；材料与笔记在确认开始复训后才提供给模型。导出含任务记录和附件引用，不含附件原文件。</p></div>
    </section>
    <div v-if="filtered.length" class="improvement-list"><ImprovementTaskCard v-for="task in filtered" :key="task.id" :task="task" /></div>
    <div v-else-if="!tasks.error" class="empty-state surface-panel"><h2>{{ tasks.tasks.length ? '没有符合筛选条件的任务' : '从一份报告开始改进' }}</h2><p>在诊断报告的行动清单中点击“加入改进任务”，即可在这里持续跟进。</p><RouterLink to="/history" class="app-button button-primary">查看历史报告</RouterLink><RouterLink v-if="!projects.projects.length" to="/projects/new" class="app-button button-secondary">创建项目</RouterLink></div>
  </div>
</template>
