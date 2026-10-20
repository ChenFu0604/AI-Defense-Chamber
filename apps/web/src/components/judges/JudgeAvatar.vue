<script setup lang="ts">
import { computed } from 'vue'
import { BriefcaseBusiness, CodeXml, UsersRound, Flame } from 'lucide-vue-next'
import { judgeDefinitions, type JudgeId } from '@defense/shared'
const props = withDefaults(defineProps<{ id: JudgeId; size?: number }>(), { size: 22 })
const judge = computed(() => judgeDefinitions.find((item) => item.id === props.id)!)
const icons = { business: BriefcaseBusiness, technology: CodeXml, user: UsersRound, devil: Flame }
</script>
<template>
  <span class="role-avatar" :class="judge.color" aria-hidden="true"
    ><component :is="icons[judge.icon]" :size="size" :stroke-width="1.7"
  /></span>
</template>
