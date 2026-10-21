<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { projectTypeLabels, type ProjectDraft } from '@defense/shared'
import { useProjectsStore } from '../stores/projects'
import { readProjectDrafts } from '../services/project-drafts'
import StorageNotice from '../components/StorageNotice.vue'
import AppButton from '../components/ui/AppButton.vue'
const projects = useProjectsStore()
const search = ref(''), scope = ref('active'), error = ref('')
const drafts = ref<ProjectDraft[]>([])
function load() {
  projects.loadProjects()
  try { drafts.value = readProjectDrafts(); error.value = '' }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '草稿读取失败。' }
}
onMounted(() => { load(); window.addEventListener('storage', load) })
onBeforeUnmount(() => window.removeEventListener('storage', load))
const filtered = computed(() => projects.projects.filter((p) => {
  const archived = projects.archivedIds.includes(p.id)
  return (scope.value === 'archived' ? archived : !archived) &&
    `${p.name} ${p.description}`.toLowerCase().includes(search.value.trim().toLowerCase())
}))
const filteredDrafts = computed(() => drafts.value.filter((d) =>
  `${d.input.name} ${d.input.description}`.toLowerCase().includes(search.value.trim().toLowerCase())))
</script>
<template>
  <div class="view-heading"><div class="eyebrow">YOUR PROJECT WORKSPACE</div><h1>我的项目</h1><p>从草稿开始，修改资料，再围绕同一个项目持续训练。归档只收起项目，不删除答辩与版本。</p></div>
  <StorageNotice />
  <p v-if="error || projects.saveError" class="notice notice-error" role="alert">{{ error || projects.saveError }}</p>
  <div class="project-library-toolbar">
    <label>搜索项目<input v-model="search" type="search" placeholder="项目名称或简介" /></label>
    <label>查看范围<select v-model="scope"><option value="active">使用中的项目</option><option value="archived">已归档项目</option></select></label>
    <AppButton variant="secondary" @click="load">刷新</AppButton>
    <RouterLink to="/projects/new" class="app-button button-primary">创建项目</RouterLink>
  </div>
  <section v-if="scope === 'active' && filteredDrafts.length" class="project-library-section">
    <h2>继续整理草稿</h2>
    <div class="project-library-grid">
      <article v-for="draft in filteredDrafts" :key="draft.key" class="library-card">
        <span class="library-tag">{{ draft.baseProject ? '编辑中的草稿' : '未完成建档' }}</span>
        <h3>{{ draft.input.name || '还没命名的想法' }}</h3>
        <p>{{ draft.input.description || '从一句话介绍开始，不必一次写完。' }}</p>
        <small>保存于 {{ new Date(draft.updatedAt).toLocaleString('zh-CN') }}</small>
        <RouterLink :to="draft.baseProject ? { name: 'project-edit', params: { id: draft.baseProject.id } } : { name: 'project-create' }" class="app-button button-secondary">继续填写</RouterLink>
      </article>
    </div>
  </section>
  <section class="project-library-section">
    <h2>{{ scope === 'archived' ? '已归档项目' : '已建档项目' }} · {{ filtered.length }}</h2>
    <div class="project-library-grid">
      <article v-for="project in filtered" :key="project.id" class="library-card">
        <span class="library-tag">{{ projectTypeLabels[project.projectType] }} · 第 {{ (projects.revisions.find(v => v.projectId === project.id)?.snapshots.length ?? 0) + 1 }} 版</span>
        <h3><RouterLink :to="{ name: 'project-detail', params: { id: project.id } }">{{ project.name }}</RouterLink></h3>
        <p>{{ project.description }}</p>
        <small>最近修改 {{ new Date(project.updatedAt).toLocaleString('zh-CN') }}</small>
        <div class="library-card-actions">
          <RouterLink v-if="scope === 'active'" :to="{ name: 'defense', query: { project: project.id } }" class="app-button button-primary">开始训练</RouterLink>
          <RouterLink :to="{ name: 'project-edit', params: { id: project.id } }" class="app-button button-secondary">编辑资料</RouterLink>
          <RouterLink :to="{ name: 'project-detail', params: { id: project.id } }" class="text-button">详情与版本</RouterLink>
          <AppButton variant="ghost" :disabled="projects.saving" @click="projects.setArchived(project.id, scope !== 'archived')">{{ scope === 'archived' ? '恢复项目' : '归档' }}</AppButton>
        </div>
      </article>
    </div>
    <div v-if="!filtered.length && projects.loaded && !projects.loadError" class="empty-state"><h3>{{ search ? '没有匹配的项目' : scope === 'archived' ? '还没有归档项目' : '先留下你的第一个想法' }}</h3><p>草稿可以分次填写，完成资料后再开始训练。</p><RouterLink to="/projects/new" class="app-button button-primary">创建项目</RouterLink></div>
  </section>
</template>
