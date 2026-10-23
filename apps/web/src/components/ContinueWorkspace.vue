<script setup lang="ts">
import AeroDecor from './ui/AeroDecor.vue'
import StatusNotice from './ui/StatusNotice.vue'
import { onMounted, ref } from 'vue'
import { type ProjectDraft } from '@defense/shared'
import { readProjectDrafts } from '../services/project-drafts'
import { loadHistorySources } from '../services/history-service'
const draft = ref<ProjectDraft | null>(null), error = ref('')
const sessions = ref<{ id: string; name: string; mode: string; known: boolean }[]>([])
onMounted(() => {
  const warnings: string[] = []
  try { draft.value = readProjectDrafts()[0] ?? null }
  catch (failure) { warnings.push(failure instanceof Error ? failure.message : '草稿读取失败。') }
  try {
    const source = loadHistorySources()
    sessions.value = source.archive.entries
      .filter((e) => e.session.status !== 'ended')
      .sort((a, b) => Date.parse(b.session.updatedAt) - Date.parse(a.session.updatedAt))
      .map((e) => ({ id: e.session.id, name: e.session.project.name, mode: e.session.mode, known: true }))
    sessions.value.push(...source.legacy.map((e) => ({ id: e.id, name: e.name, mode: e.mode, known: false })))
    sessions.value = sessions.value.slice(0, 3)
    warnings.push(...source.warnings)
  } catch (failure) { warnings.push(failure instanceof Error ? failure.message : '历史读取失败。') }
  error.value = warnings.join(' ')
})
</script>
<template>
  <section v-if="draft || sessions.length || error" class="continue-workspace">
    <div class="section-heading"><h2>接着上次，继续向前。</h2><RouterLink to="/projects" class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">我的项目 →</RouterLink></div>
    <StatusNotice v-if="error" tone="warning" compact>{{ error }}</StatusNotice>
    <div class="project-library-grid">
      <article v-if="draft" class="library-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor /><span class="library-tag">资料草稿</span><h3>{{ draft.input.name || '未命名项目' }}</h3><p>你的输入已保存，可以接着整理。</p><RouterLink :to="draft.baseProject ? { name: 'project-edit', params: { id: draft.baseProject.id } } : { name: 'project-create' }" class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />继续填写资料</RouterLink></article>
      <article v-for="session in sessions" :key="session.id" class="library-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor /><span class="library-tag">{{ session.mode === 'demo' ? '固定模板演示' : 'AI 训练' }}</span><h3>{{ session.name }}</h3><p>{{ session.known ? '上次保存时尚未结束，打开后核对最新状态。' : '最近打开过的会话，进入后恢复实际状态。' }}</p><RouterLink :to="{ name: 'defense-session', params: { id: session.id } }" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />{{ session.known ? '继续训练' : '打开最近会话' }}</RouterLink></article>
    </div>
  </section>
</template>
