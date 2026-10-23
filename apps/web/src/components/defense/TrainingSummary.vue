<script setup lang="ts">
import { trainingSettings, trainingGoalLabels, trainingStyleLabels, type DefenseSession } from '@defense/shared'
import { computed } from 'vue'
const props = defineProps<{ session: DefenseSession }>()
const settings = computed(() => trainingSettings(props.session))
</script>
<template>
  <div class="training-summary" aria-label="本轮练习设置">
    <span>训练方式：{{ session.preferences ? trainingStyleLabels[settings.style] : '原有训练规则' }}</span>
    <span>训练目标：{{ trainingGoalLabels[settings.goal] }}</span>
    <span>最多 {{ settings.questionLimit }} 题</span>
    <span>已求助 {{ session.assistance?.length ?? 0 }} 次</span>
    <span v-if="session.training">复训资料：{{ session.training.projectSource === 'current' ? '重新选定的项目版本' : '原答辩快照' }}</span>
    <span v-if="session.training?.tasks?.length">重点复测 {{ session.training.tasks.length }} 项改进任务</span>
    <small v-if="session.assistance?.length">包含系统提示辅助，不能直接等同于独立作答表现。</small>
  </div>
</template>
