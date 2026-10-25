<script setup lang="ts">
import StatusNotice from './ui/StatusNotice.vue'
import { computed, onMounted, ref } from 'vue'
import { type ProjectDraft } from '@defense/shared'
import { readProjectDrafts } from '../services/project-drafts'
import { useServerHistoryFeed } from '../composables/useServerHistoryFeed'
const draft = ref<ProjectDraft | null>(null), draftError = ref('')
const feed = useServerHistoryFeed(), loading = feed.loading
const error = computed(() => [draftError.value, feed.error.value].filter(Boolean).join(' '))
const sessions = computed(() => (feed.archive.value?.entries ?? [])
  .filter(entry => entry.session.status !== 'ended')
  .sort((a, b) => Date.parse(b.session.updatedAt) - Date.parse(a.session.updatedAt))
  .slice(0, 3).map(({session}) => ({ id: session.id, name: session.project.name, mode: session.mode, known: true })))
onMounted(() => {
  try { draft.value = readProjectDrafts()[0] ?? null }
  catch (failure) { draftError.value = failure instanceof Error ? failure.message : '草稿读取失败。' }
})
</script>
<template>
  <section v-if="draft || sessions.length || error || loading" class="continue-workspace">
    <div class="section-heading"><h2>接着上次，继续向前。</h2><RouterLink to="/projects" class="text-button">我的项目 →</RouterLink></div>
    <StatusNotice v-if="error" tone="warning" compact>{{ error }}</StatusNotice>
    <StatusNotice v-if="loading" busy compact>正在读取服务端训练记录…</StatusNotice>
    <div class="project-library-grid">
      <article v-if="draft" class="library-card surface-panel">
      <span class="library-tag">资料草稿</span><h3>{{ draft.input.name || '未命名项目' }}</h3><p>你的输入已保存，可以接着整理。</p><RouterLink :to="draft.baseProject ? { name: 'project-edit', params: { id: draft.baseProject.id } } : { name: 'project-create' }" class="app-button button-secondary control-button">
      继续填写资料</RouterLink></article>
      <article v-for="session in sessions" :key="session.id" class="library-card surface-panel">
      <span class="library-tag">{{ session.mode === 'demo' ? '固定模板演示' : 'AI 训练' }}</span><h3>{{ session.name }}</h3><p>{{ session.known ? '上次保存时尚未结束，打开后核对最新状态。' : '最近打开过的会话，进入后恢复实际状态。' }}</p><RouterLink :to="{ name: 'defense-session', params: { id: session.id } }" class="app-button button-primary control-button">
      {{ session.known ? '继续训练' : '打开最近会话' }}</RouterLink></article>
    </div>
  </section>
</template>
