<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { projectTypeLabels } from '@defense/shared'
import { useHistoryStore } from '../stores/history'
import AnalysisResults from '../components/analysis/AnalysisResults.vue'
import AttachmentGallery from '../components/attachments/AttachmentGallery.vue'
import ProjectSnapshot from '../components/ProjectSnapshot.vue'
const route = useRoute(),
  store = useHistoryStore(),
  id = computed(() => String(route.params.id))
const project = computed(() => store.archive.projects.find((p) => p.id === id.value)),
  analyses = computed(() => store.archive.analyses.filter((a) => a.projectId === id.value))
onMounted(store.load)
</script>
<template>
  <RouterLink to="/history" class="back-link focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">← 返回历史记录</RouterLink>
  <div class="view-heading">
    <h1>已保存项目档案</h1>
    <p>资料与分析按保存版本读取，不触发模型。</p>
  </div>
  <StatusNotice v-if="store.error" tone="error" compact>{{ store.error }}</StatusNotice>
  <template v-if="project"
    ><section class="history-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
      <h2>{{ project.name }}</h2>
      <p>{{ projectTypeLabels[project.projectType] }}</p>
      <ProjectSnapshot :project="project" />
      <AttachmentGallery v-if="project.attachments?.length" :items="project.attachments" />
      <RouterLink :to="{ name: 'defense', query: { project: id } }" class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
        >使用当前浏览器项目继续准备 →</RouterLink
      >
    </section>
    <AnalysisResults v-for="record in analyses" :key="record.id" :record="record" />
    <StatusNotice v-if="!analyses.length" tone="info" compact>暂无保存的项目分析。</StatusNotice></template
  >
  <StatusNotice v-else-if="!store.error" tone="info" compact>没有找到该项目档案。</StatusNotice>
</template>
