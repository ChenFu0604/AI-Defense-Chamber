<script setup lang="ts">
import { certaintyLabels, projectFieldLabels, type AnalysisFinding } from '@defense/shared'
defineProps<{ title?: string; finding: AnalysisFinding }>()
</script>
<template>
  <article class="analysis-finding">
    <div class="analysis-card-heading">
      <h3 v-if="title">{{ title }}</h3>
      <span class="certainty-tag" :class="finding.certainty">{{
        certaintyLabels[finding.certainty]
      }}</span>
    </div>
    <p class="finding-summary">{{ finding.summary }}</p>
    <p class="finding-reason">{{ finding.reasoning }}</p>
    <details v-if="finding.evidence.length" class="finding-evidence">
      <summary>查看材料依据 · {{ finding.evidence.length }} 处</summary>
      <blockquote v-for="(reference, index) in finding.evidence" :key="index">
        <span>{{
          reference.field === 'materials'
            ? '附件提取文字（未外部核验）'
            : projectFieldLabels[reference.field]
        }}</span>
        <p>“{{ reference.quote }}”</p>
      </blockquote>
    </details>
  </article>
</template>
