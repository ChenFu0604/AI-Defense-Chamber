<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { projectTypeLabels, type ProjectDraft } from '@defense/shared'
import { ArrowUpRight, FilePenLine, FolderOpen, Plus, RefreshCw, Search } from 'lucide-vue-next'
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
  <div class="project-workspace-page">
  <header class="project-page-header">
    <div class="view-heading"><h1>我的项目</h1><p>整理想法、准备答辩，让每次训练都有一个清晰起点。</p></div>
    <RouterLink to="/projects/new" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" /><Plus :size="17" />创建项目</RouterLink>
  </header>
  <StorageNotice />
  <StatusNotice v-if="error || projects.saveError" tone="error" compact>{{ error || projects.saveError }}</StatusNotice>
  <div class="project-library-overview aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out" aria-label="项目概览">
      <AeroDecor />
    <div><FolderOpen :size="20" /><span>使用中的项目<strong>{{ projects.loaded ? projects.activeProjects.length : '—' }}</strong></span></div>
    <div><FilePenLine :size="20" /><span>待整理草稿<strong>{{ error ? '—' : drafts.length }}</strong></span></div>
    <p>资料可以分次填写。归档只收起项目，不删除答辩与版本。</p>
  </div>
  <div class="project-library-toolbar project-search-toolbar aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
    <label class="project-search-field"><span><Search :size="15" />搜索项目</span><input class="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl text-sky-900 placeholder:text-sky-400/50 focus:outline-none focus:border-white/70 focus:bg-white/40 transition-all focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" v-model="search" type="search" placeholder="搜索项目名称或简介" /></label>
    <label class="project-scope-field">查看范围<select class="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl text-sky-900 placeholder:text-sky-400/50 focus:outline-none focus:border-white/70 focus:bg-white/40 transition-all focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" v-model="scope"><option value="active">使用中的项目</option><option value="archived">已归档项目</option></select></label>
    <AppButton variant="secondary" @click="load"><RefreshCw :size="15" />刷新</AppButton>
  </div>
  <section v-if="scope === 'active' && filteredDrafts.length" class="project-library-section project-draft-section" aria-labelledby="drafts-heading">
    <div class="project-section-heading"><div><h2 id="drafts-heading">接着上次继续<span>{{ filteredDrafts.length }}</span></h2><p>这些是已保存的草稿，补齐后即可创建或更新项目。</p></div><FilePenLine :size="21" /></div>
    <div class="project-library-grid">
      <article v-for="draft in filteredDrafts" :key="draft.key" class="library-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
        <span class="library-tag">{{ draft.baseProject ? '编辑中的草稿' : '未完成建档' }}</span>
        <h3>{{ draft.input.name || '还没命名的想法' }}</h3>
        <p>{{ draft.input.description || '从一句话介绍开始，不必一次写完。' }}</p>
        <small>保存于 {{ new Date(draft.updatedAt).toLocaleString('zh-CN') }}</small>
        <RouterLink :to="draft.baseProject ? { name: 'project-edit', params: { id: draft.baseProject.id } } : { name: 'project-create' }" class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />继续填写</RouterLink>
      </article>
    </div>
  </section>
  <section class="project-library-section" aria-labelledby="saved-projects-heading">
    <div class="project-section-heading"><div><h2 id="saved-projects-heading">{{ scope === 'archived' ? '已归档项目' : '已建档项目' }}<span>{{ filtered.length }}</span></h2><p>{{ scope === 'archived' ? '恢复项目后，可以继续围绕原有资料训练。' : '选择一个项目，查看画像、完善资料或开始训练。' }}</p></div></div>
    <StatusNotice v-if="!projects.loaded && !projects.loadError" busy compact>正在读取本地项目…</StatusNotice>
    <div class="project-library-grid">
      <article v-for="project in filtered" :key="project.id" class="library-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
        <div class="project-library-card-top"><span class="project-library-icon"><FolderOpen :size="20" /></span><span class="library-tag">{{ projectTypeLabels[project.projectType] }}</span><small>第 {{ (projects.revisions.find(v => v.projectId === project.id)?.snapshots.length ?? 0) + 1 }} 版</small></div>
        <h3><RouterLink class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" :to="{ name: 'project-detail', params: { id: project.id } }">{{ project.name }}</RouterLink></h3>
        <p>{{ project.description }}</p>
        <small>最近修改 {{ new Date(project.updatedAt).toLocaleString('zh-CN') }}</small>
        <div class="library-card-actions">
          <RouterLink v-if="scope === 'active'" :to="{ name: 'defense', query: { project: project.id } }" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />开始训练<ArrowUpRight :size="15" /></RouterLink>
          <RouterLink :to="{ name: 'project-edit', params: { id: project.id } }" class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />编辑资料</RouterLink>
        </div>
        <div class="project-library-card-footer">
          <RouterLink :to="{ name: 'project-detail', params: { id: project.id } }" class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">详情与版本</RouterLink>
          <AppButton variant="ghost" :disabled="projects.saving" @click="projects.setArchived(project.id, scope !== 'archived')">{{ scope === 'archived' ? '恢复项目' : '归档' }}</AppButton>
        </div>
      </article>
    </div>
    <div v-if="!filtered.length && projects.loaded && !projects.loadError" class="empty-state aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor /><h3>{{ search ? '没有匹配的项目' : scope === 'archived' ? '还没有归档项目' : '先留下你的第一个想法' }}</h3><p>草稿可以分次填写，完成资料后再开始训练。</p><RouterLink to="/projects/new" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />创建项目</RouterLink></div>
  </section>
  </div>
</template>
