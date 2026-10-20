<script setup lang="ts">
import { BriefcaseBusiness, CodeXml, UsersRound, Flame } from 'lucide-vue-next'
import type { JudgePreview } from '../types/judge'
defineProps<{ judge: JudgePreview }>()
const icons = { business: BriefcaseBusiness, technology: CodeXml, user: UsersRound, devil: Flame }
</script>
<template>
  <article class="judge-card" :class="judge.color">
    <div class="judge-card-top">
      <span class="judge-icon"
        ><component :is="icons[judge.icon]" :size="21" :stroke-width="1.6" /></span
      ><span class="judge-number">{{ judge.number }} / 04</span>
    </div>
    <h3>{{ judge.name }}</h3>
    <p class="judge-english">{{ judge.english }}</p>
    <p class="judge-perspective">{{ judge.perspective }}</p>
    <blockquote>“{{ judge.question }}”</blockquote>
  </article>
</template>
