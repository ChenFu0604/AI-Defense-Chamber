<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { projectTypeLabels } from '@defense/shared'
import { useHistoryStore } from '../stores/history'
import AnalysisResults from '../components/analysis/AnalysisResults.vue'
const route = useRoute(),
  store = useHistoryStore(),
  id = computed(() => String(route.params.id))
const project = computed(() => store.archive.projects.find((p) => p.id === id.value)),
  analyses = computed(() => store.archive.analyses.filter((a) => a.projectId === id.value))
onMounted(store.load)
</script>
<template>
  <RouterLink to="/history" class="back-link">← 返回历史记录</RouterLink>
  <div class="view-heading">
    <h1>已保存项目档案</h1>
    <p>资料与分析按保存版本读取，不触发模型。</p>
  </div>
  <p v-if="store.error" class="notice notice-error" role="alert">{{ store.error }}</p>
  <template v-if="project"
    ><section class="history-card">
      <h2>{{ project.name }}</h2>
      <p>{{ projectTypeLabels[project.projectType] }}</p>
      <p class="history-original">{{ project.description }}</p>
      <h3>目标用户</h3>
      <p>{{ project.targetUsers }}</p>
      <h3>核心功能</h3>
      <p>{{ project.coreFeatures }}</p>
      <h3>技术方案</h3>
      <p>{{ project.technicalPlan }}</p>
      <h3>商业或应用价值</h3>
      <p>{{ project.valueProposition }}</p>
      <RouterLink :to="{ name: 'defense', query: { project: id } }" class="text-button"
        >使用当前浏览器项目继续准备 →</RouterLink
      >
    </section>
    <AnalysisResults v-for="record in analyses" :key="record.id" :record="record" />
    <p v-if="!analyses.length" class="notice">暂无保存的项目分析。</p></template
  >
  <p v-else-if="!store.error" class="notice">没有找到该项目档案。</p>
</template>
