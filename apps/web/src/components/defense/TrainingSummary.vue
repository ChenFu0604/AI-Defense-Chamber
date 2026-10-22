<script setup lang="ts">
import { trainingSettings, trainingGoalLabels, trainingStyleLabels, type DefenseSession } from '@defense/shared'
import { computed } from 'vue'
const props = defineProps<{ session: DefenseSession }>()
const settings = computed(() => trainingSettings(props.session))
</script>
<template>
  <p class="training-summary">
    {{ session.preferences ? trainingStyleLabels[settings.style] : '原有训练规则' }} · {{ trainingGoalLabels[settings.goal] }} · 最多 {{ settings.questionLimit }} 题 · 已求助 {{ session.assistance?.length ?? 0 }} 次
    <small v-if="session.assistance?.length">包含系统提示辅助，不能直接等同于独立作答表现。</small>
  </p>
</template>
