<script setup lang="ts">
import AeroDecor from './ui/AeroDecor.vue'
import { projectFieldLabels, type ProjectInput } from '@defense/shared'
defineProps<{ project: ProjectInput }>()
const fields = [
  'description',
  'targetUsers',
  'coreFeatures',
  'technicalPlan',
  'valueProposition',
] as const
</script>
<template>
  <div class="project-snapshot-grid">
    <section v-for="field in fields" :key="field" class="project-snapshot-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
      <h4>{{ projectFieldLabels[field] }}</h4>
      <p>{{ project[field] }}</p>
    </section>
  </div>
</template>
