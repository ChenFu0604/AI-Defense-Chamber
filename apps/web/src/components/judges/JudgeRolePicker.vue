<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import { judgeDefinitions, type JudgeId } from '@defense/shared'
import JudgeAvatar from './JudgeAvatar.vue'
const props = withDefaults(
  defineProps<{ modelValue: JudgeId; disabled?: boolean; label?: string; active?: boolean }>(),
  { label: '选择首位评委', disabled: false, active: false },
)
const emit = defineEmits<{ 'update:modelValue': [id: JudgeId] }>()
const name = useId()
const selected = ref(props.modelValue)
watch(
  () => props.modelValue,
  (id) => {
    selected.value = id
  },
)
const english = {
  business: 'THE STRATEGIST',
  technical: 'THE ARCHITECT',
  user: 'THE ADVOCATE',
  devil: 'THE CHALLENGER',
}
function choose(id: JudgeId) {
  if (!props.disabled && id !== props.modelValue) emit('update:modelValue', id)
  // A role switch may be asynchronous or fail. Keep native radio state aligned
  // with the confirmed parent value, including when that value stays unchanged.
  void nextTick(() => {
    selected.value = props.modelValue
  })
}
</script>
<template>
  <fieldset class="role-picker" :disabled="disabled">
    <legend>{{ label }}</legend>
    <div class="role-picker-grid">
      <label
        v-for="judge in judgeDefinitions"
        :key="judge.id"
        class="role-choice"
        :class="[judge.color, { selected: modelValue === judge.id }]"
      >
        <input
          v-model="selected"
          type="radio"
          :name="name"
          :value="judge.id"
          :aria-label="judge.name"
          @change="choose(judge.id)"
        />
        <span class="role-choice-top"
          ><JudgeAvatar :id="judge.id" /><span class="role-choice-check"
            ><Check v-if="modelValue === judge.id" :size="14" /></span
        ></span>
        <strong>{{ judge.name }}</strong
        ><span class="role-choice-english">{{ english[judge.id] }}</span>
        <span class="role-choice-intro">{{ judge.introduction }}</span>
        <span class="role-choice-tags"
          ><span v-for="dimension in judge.dimensions.slice(0, 2)" :key="dimension">{{
            dimension
          }}</span></span
        >
        <span class="role-choice-state">{{
          modelValue === judge.id
            ? active
              ? '当前评委'
              : '已选为首位评委'
            : active
              ? '切换至此评委'
              : '选择此评委'
        }}</span>
      </label>
    </div>
  </fieldset>
</template>
