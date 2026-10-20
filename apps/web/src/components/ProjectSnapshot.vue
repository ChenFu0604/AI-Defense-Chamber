<script setup lang="ts">
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
    <section v-for="field in fields" :key="field" class="project-snapshot-card">
      <h4>{{ projectFieldLabels[field] }}</h4>
      <p>{{ project[field] }}</p>
    </section>
  </div>
</template>
