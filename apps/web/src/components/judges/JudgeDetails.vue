<script setup lang="ts">
import type { JudgeDefinition } from '@defense/shared'
defineProps<{ judge: JudgeDefinition }>()
</script>
<template>
  <section class="judge-details" :aria-label="`${judge.name}详情`">
    <h3>{{ judge.name }} · 怎样帮你思考</h3>
    <p>{{ judge.introduction }}</p>
    <div class="judge-dimensions">
      <span v-for="dimension in judge.dimensions" :key="dimension">{{ dimension }}</span>
    </div>
    <h4>我们会从这里聊起</h4>
    <p>{{ judge.strategy }}</p>
    <h4>接下来怎样深入</h4>
    <ul>
      <li v-for="rule in judge.followUpRules" :key="rule">{{ rule }}</li>
    </ul>
  </section>
</template>
