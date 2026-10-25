<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { FileCheck2, MessageSquare, ChartNoAxesCombined, ClipboardList, MessagesSquare, ScrollText } from 'lucide-vue-next'

defineProps<{ projectName: string; mode: 'live' | 'demo'; answers: number }>()
const route = useRoute()
const sections = [
  { hash: '#report-evaluation', label: '评分与建议', icon: ChartNoAxesCombined },
  { hash: '#report-training', label: '本轮练习', icon: ClipboardList },
  { hash: '#report-feedback', label: '逐轮反馈', icon: MessagesSquare },
  { hash: '#report-transcript', label: '完整记录', icon: ScrollText },
] as const
const activeSection = computed(() => route.hash.startsWith('#answer-')
  ? '#report-transcript'
  : sections.find(section => section.hash === route.hash)?.hash ?? '#report-evaluation')
</script>
<template>
  <section class="report-session-overview surface-panel" aria-label="本场答辩概览">
    <header class="report-session-heading">
      <span class="report-session-icon" aria-hidden="true"><FileCheck2 :size="22" /></span>
      <div class="report-session-identity">
        <h2>{{ projectName }}</h2>
        <div class="report-session-meta">
          <span class="report-source-badge" :class="mode">{{ mode === 'demo' ? '模拟诊断 · 未调用模型' : '真实答辩记录' }}</span>
          <span>AI 主观训练建议</span>
        </div>
      </div>
      <div class="report-answer-count"><MessageSquare :size="16" aria-hidden="true" /><span>已保存 <strong>{{ answers }}</strong> 次回答</span></div>
    </header>
    <nav class="report-section-tabs" aria-label="报告内容导航">
      <RouterLink v-for="section in sections" :key="section.hash"
        :to="{ path: route.path, query: route.query, hash: section.hash }"
        :class="{ 'is-selected': activeSection === section.hash }"
        :aria-current="activeSection === section.hash ? 'location' : undefined">
        <component :is="section.icon" :size="16" aria-hidden="true" />{{ section.label }}
      </RouterLink>
    </nav>
  </section>
</template>
<style scoped>
.report-session-overview { min-width: 0; margin: 18px 0 20px; padding: 18px 20px 0; }
.report-session-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.report-session-icon { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: 11px; background: var(--accent-soft); color: var(--accent); }
.report-session-identity { flex: 1 1 220px; min-width: 0; }
.report-session-identity h2 { margin: 0; color: var(--text-primary); font-size: 19px; font-weight: var(--weight-strong); line-height: 1.5; overflow-wrap: anywhere; }
.report-session-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 12px; margin-top: 5px; color: var(--text-secondary); font-size: 12px; line-height: 1.7; }
.report-source-badge { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 5px; background: var(--accent-soft); color: var(--accent); }
.report-source-badge.demo { background: var(--warning-soft); color: var(--warning); }
.report-answer-count { display: inline-flex; align-items: center; flex-shrink: 0; gap: 7px; padding: 7px 11px; border-radius: 8px; background: var(--surface-subtle); color: var(--text-secondary); font-size: 12px; line-height: 1.7; }
.report-answer-count > svg { color: var(--accent); }
.report-answer-count strong { color: var(--text-primary); font-size: 15px; font-weight: var(--weight-strong); font-variant-numeric: tabular-nums; }
.report-section-tabs { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 16px; padding: 10px 0; border-top: 1px solid var(--line); }
.report-section-tabs > a { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 7px 12px; border-radius: 7px; color: var(--text-secondary); font-size: 13px; font-weight: var(--weight-medium); line-height: 1.5; transition: background-color 150ms ease, color 150ms ease; }
.report-section-tabs > a:hover { color: var(--accent); background: var(--surface-subtle); }
.report-section-tabs > a.is-selected { color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 -2px 0 var(--accent); }
.report-section-tabs > a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 600px) {
  .report-session-overview { padding: 16px 14px 0; }
  .report-session-identity { flex-basis: calc(100% - 56px); }
  .report-answer-count { margin-left: 56px; padding: 0; background: transparent; }
  .report-section-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 12px; }
  .report-section-tabs > a { padding: 8px; }
}
@media (prefers-reduced-motion: reduce) { .report-section-tabs > a { transition: none; } }
</style>
