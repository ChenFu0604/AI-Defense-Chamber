<script setup lang="ts">
import AeroDecor from '../ui/AeroDecor.vue'
import { BriefcaseBusiness, CodeXml, UsersRound, Flame } from 'lucide-vue-next'
import { judgeStatusLabels, type JudgeDefinition, type JudgeStatus } from '@defense/shared'
defineProps<{ judge: JudgeDefinition; status: JudgeStatus; selected: boolean; active: boolean }>()
defineEmits<{ select: [] }>()
const icons = { business: BriefcaseBusiness, technology: CodeXml, user: UsersRound, devil: Flame }
</script>
<template>
  <button
    type="button"
    class="judge-card judge-seat aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
    :class="[judge.color, { selected, active }]"
    :aria-pressed="selected"
    :aria-label="`${judge.name}，${judgeStatusLabels[status]}，查看详情`"
    @click="$emit('select')"
  >
      <AeroDecor />
    <span class="judge-card-top"
      ><span class="judge-icon"><component :is="icons[judge.icon]" :size="22" /></span
      ><span v-if="active" class="judge-active-label">当前活跃</span></span
    >
    <h3>{{ judge.name }}</h3>
    <p class="judge-perspective">{{ judge.introduction }}</p>
    <span class="judge-state" :class="status"><i></i>{{ judgeStatusLabels[status] }}</span>
  </button>
</template>
