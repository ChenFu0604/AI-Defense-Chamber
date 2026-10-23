<script setup lang="ts">
import { BriefcaseBusiness, CodeXml, UsersRound, Flame } from 'lucide-vue-next'
import { judgeStatusLabels, type JudgeDefinition, type JudgeStatus } from '@defense/shared'
defineProps<{ judge: JudgeDefinition; status: JudgeStatus; selected: boolean; active: boolean }>()
defineEmits<{ select: [] }>()
const icons = { business: BriefcaseBusiness, technology: CodeXml, user: UsersRound, devil: Flame }
</script>
<template>
  <button
    type="button"
    class="judge-card judge-seat surface-panel"
    :class="[judge.color, { selected, active }]"
    :aria-pressed="selected"
    :aria-label="`${judge.name}，${judgeStatusLabels[status]}，查看详情`"
    @click="$emit('select')"
  >

    <span class="judge-card-top"
      ><span class="judge-icon"><component :is="icons[judge.icon]" :size="22" /></span
      ><span v-if="active" class="judge-active-label">当前活跃</span></span
    >
    <h3>{{ judge.name }}</h3>
    <p class="judge-perspective">{{ judge.introduction }}</p>
    <span class="judge-state" :class="status"><i></i>{{ judgeStatusLabels[status] }}</span>
  </button>
</template>
