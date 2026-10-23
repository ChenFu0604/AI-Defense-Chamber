<script setup lang="ts">
import { useId } from 'vue'
import { Check, Sparkles, FlaskConical } from 'lucide-vue-next'
import type { AnalysisMode } from '@defense/shared'
withDefaults(defineProps<{ modelValue: AnalysisMode; disabled?: boolean; label?: string }>(), {
  label: '会话来源',
})
const emit = defineEmits<{ 'update:modelValue': [mode: AnalysisMode] }>()
const name = useId()
const modes = [
  {
    id: 'live' as const,
    name: '真实模型',
    caption: '围绕项目资料，生成针对性问题',
    note: '使用后端配置的模型 · 可能消耗额度',
    icon: Sparkles,
  },
  {
    id: 'demo' as const,
    name: '模拟演示',
    caption: '先熟悉流程，再开始正式练习',
    note: '规则模板 · 不调用模型、不生成真实评分',
    icon: FlaskConical,
  },
]
</script>
<template>
  <fieldset class="defense-mode-picker" :disabled="disabled">
    <legend>{{ label }}</legend>
    <div class="defense-mode-grid">
      <label
        v-for="mode in modes"
        :key="mode.id"
        class="defense-mode-choice"
        :class="{ selected: modelValue === mode.id }"
      >
        <input class="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl text-sky-900 placeholder:text-sky-400/50 focus:outline-none focus:border-white/70 focus:bg-white/40 transition-all focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          type="radio"
          :name="name"
          :value="mode.id"
          :checked="modelValue === mode.id"
          :aria-label="mode.name"
          @change="emit('update:modelValue', mode.id)"
        />
        <span class="defense-mode-icon"><component :is="mode.icon" :size="22" /></span
        ><span class="defense-mode-copy"
          ><strong>{{ mode.name }}</strong
          ><span>{{ mode.caption }}</span
          ><small>{{ mode.note }}</small></span
        ><span class="mode-selected-mark"><Check v-if="modelValue === mode.id" :size="14" /></span>
      </label>
    </div>
  </fieldset>
</template>
