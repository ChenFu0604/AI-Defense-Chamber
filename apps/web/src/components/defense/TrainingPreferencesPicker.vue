<script setup lang="ts">
import { trainingStyleLabels, trainingGoalLabels, type TrainingPreferences } from '@defense/shared'
defineProps<{ modelValue: TrainingPreferences; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: TrainingPreferences] }>()
</script>
<template>
  <fieldset class="training-preferences" :disabled="disabled">
    <legend>这次想怎么练？</legend>
    <div class="training-style-options">
      <label v-for="(name, key) in trainingStyleLabels" :key="key" :class="{selected: modelValue.style === key}">
        <input type="radio" name="training-style" :value="key" :checked="modelValue.style === key" @change="emit('update:modelValue', {...modelValue, style: key})" />
        <strong>{{ name }}</strong><small>{{ key === 'guided' ? '一起想清项目，评委会给简短思考提示' : '按答辩节奏练习，需要时再主动求助' }}</small>
      </label>
    </div>
    <div class="training-selects">
      <label>本次训练目标<select :value="modelValue.goal" @change="emit('update:modelValue', {...modelValue, goal: ($event.target as HTMLSelectElement).value as TrainingPreferences['goal']})"><option v-for="(label, key) in trainingGoalLabels" :key="key" :value="key">{{ label }}</option></select></label>
      <label>训练长度<select :value="modelValue.questionLimit" @change="emit('update:modelValue', {...modelValue, questionLimit: Number(($event.target as HTMLSelectElement).value) as 5 | 10})"><option :value="5">短练 · 最多 5 题</option><option :value="10">完整训练 · 最多 10 题</option></select></label>
    </div>
    <p>切换评委产生的新问题也计入题数；提示不占题数，随时可以提前结束。训练目标不会改变评委各自的关注点。</p>
  </fieldset>
</template>
