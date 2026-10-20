<script setup lang="ts">
import type { JudgeDefinition } from '@defense/shared'
defineProps<{ judge: JudgeDefinition }>()
</script>
<template>
  <section class="judge-details" :aria-label="`${judge.name}详情`">
    <h3>{{ judge.name }} · 评审方式</h3>
    <p>{{ judge.introduction }}</p>
    <div class="judge-dimensions">
      <span v-for="dimension in judge.dimensions" :key="dimension">{{ dimension }}</span>
    </div>
    <h4>提问策略</h4>
    <p>{{ judge.strategy }}</p>
    <h4>追问规则</h4>
    <ul>
      <li v-for="rule in judge.followUpRules" :key="rule">{{ rule }}</li>
    </ul>
  </section>
</template>
