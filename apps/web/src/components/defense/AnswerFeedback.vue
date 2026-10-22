<script setup lang="ts">
import { answerEvaluationLabels, type DefenseMessage } from '@defense/shared'
defineProps<{ assessment: NonNullable<DefenseMessage['assessment']>; demo: boolean; rationale?: string }>()
</script>
<template>
  <section class="answer-feedback" aria-label="本轮回答反馈" aria-live="polite">
    <h3>{{ demo ? '模拟反馈 · 固定模板' : '本轮回答反馈' }}<span>{{ answerEvaluationLabels[assessment.evaluation] }}</span></h3>
    <p>{{ assessment.feedback }}</p>
    <p v-if="rationale" class="feedback-next"><strong>接下来为什么问：</strong>{{ rationale }}</p>
    <details><summary>查看回答依据</summary><p>「{{ assessment.answerQuote }}」</p></details>
    <small>{{ demo ? '仅展示交互，不评价实际回答质量。' : '根据本轮回答给出的 AI 建议，仍需核对。' }}</small>
  </section>
</template>
