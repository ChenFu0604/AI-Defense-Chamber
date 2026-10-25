<script setup lang="ts">
import { projectFieldLabels, type ProjectInput } from '@defense/shared'
import { FileText, Users, ListChecks, Workflow, BadgeCheck } from 'lucide-vue-next'
defineProps<{ project: ProjectInput }>()
const fields = [
  'description',
  'targetUsers',
  'coreFeatures',
  'technicalPlan',
  'valueProposition',
] as const
const icons = { description: FileText, targetUsers: Users, coreFeatures: ListChecks, technicalPlan: Workflow, valueProposition: BadgeCheck }
</script>
<template>
  <div class="project-snapshot-grid">
    <section v-for="field in fields" :key="field" class="project-snapshot-card surface-panel">

      <h4><component :is="icons[field]" :size="16" aria-hidden="true" />{{ projectFieldLabels[field] }}</h4>
      <p>{{ project[field] }}</p>
    </section>
  </div>
</template>
<style scoped>
.project-snapshot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 12px; margin: 16px 0 0; }
.project-snapshot-card { min-width: 0; min-height: 0; margin: 0; padding: 16px; border: 1px solid var(--border-card); border-radius: 12px; background: var(--surface-subtle); box-shadow: none; }
.project-snapshot-card:first-child { grid-column: 1 / -1; }
.project-snapshot-card h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; color: var(--text-primary); font-size: 13px; font-weight: var(--weight-strong); line-height: 1.6; }
.project-snapshot-card h4::before { display: none; }
.project-snapshot-card h4 > svg { flex-shrink: 0; color: var(--accent); }
.project-snapshot-card p { margin: 0; color: var(--text-secondary); font-size: 14px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 700px) { .project-snapshot-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; } .project-snapshot-card { padding: 14px; } }
</style>
