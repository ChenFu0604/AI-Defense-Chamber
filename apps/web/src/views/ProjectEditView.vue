<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { type Project } from '@defense/shared'
import { useProjectsStore } from '../stores/projects'
import ProjectForm from '../components/ProjectForm.vue'
import StorageNotice from '../components/StorageNotice.vue'
const route = useRoute(), router = useRouter(), projects = useProjectsStore()
const project = computed(() => projects.findProject(String(route.params.id)))
const error = ref('')
async function saved(record: Project) {
  try {
    await router.push(route.query.prepare === '1'
      ? { name: 'defense', query: { project: record.id } }
      : { name: 'project-detail', params: { id: record.id } })
  } catch {
    error.value = '新版本已保存，跳转失败；请使用表单里的查看项目入口。'
  }
}
</script>
<template>
  <RouterLink to="/projects" class="back-link focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">← 返回我的项目</RouterLink>
  <div class="view-heading"><h1>编辑项目资料</h1><p>保存后保留旧版本，已有答辩和报告继续使用当时的资料。新训练需要匹配新版资料的画像。</p></div>
  <StorageNotice />
  <StatusNotice v-if="error" tone="error" compact>{{ error }}</StatusNotice>
  <ProjectForm v-if="project" :key="project.id" :project="project" @created="saved" />
  <div v-else-if="projects.loaded && !projects.loadError" class="empty-state aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor /><h2>没有找到这个项目</h2><RouterLink to="/projects" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />查看我的项目</RouterLink></div>
</template>
