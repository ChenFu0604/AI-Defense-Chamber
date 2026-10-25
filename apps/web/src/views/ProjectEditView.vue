<script setup lang="ts">
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
  <RouterLink to="/projects" class="back-link">← 返回我的项目</RouterLink>
  <div class="view-heading"><h1>编辑项目资料</h1><p>保存后保留旧版本，已有答辩和报告继续使用当时的资料。新训练需要匹配新版资料的画像。</p></div>
  <StorageNotice />
  <StatusNotice v-if="projects.loading" busy compact>正在读取服务端项目…</StatusNotice>
  <StatusNotice v-if="error" tone="error" compact>{{ error }}</StatusNotice>
  <ProjectForm v-if="project" :key="project.id" :project="project" @created="saved" />
  <div v-else-if="projects.loaded && !projects.loadError" class="empty-state surface-panel">
      <h2>没有找到这个项目</h2><RouterLink to="/projects" class="app-button button-primary control-button">
      查看我的项目</RouterLink></div>
</template>
