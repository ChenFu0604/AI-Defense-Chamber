<script setup lang="ts">
import { computed } from 'vue'
import { CircleCheck, CircleAlert, Info, LoaderCircle, TriangleAlert } from 'lucide-vue-next'
import AeroDecor from './AeroDecor.vue'

const props = withDefaults(defineProps<{
  title?: string
  tone?: 'info' | 'success' | 'warning' | 'error'
  busy?: boolean
  compact?: boolean
  announce?: boolean
}>(), { tone: 'info', busy: false, compact: false, announce: true })
const icon = computed(() => props.busy ? LoaderCircle : {
  info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert,
}[props.tone])
</script>
<template>
  <div class="status-notice" :class="['status-notice-' + tone, { 'is-compact': compact, 'is-busy': busy }]"
    :role="announce ? tone === 'error' ? 'alert' : 'status' : undefined">
    <AeroDecor :orbs="false" />
    <span class="status-notice-icon" aria-hidden="true"><component :is="icon" :size="18" :class="{ spinning: busy }" /></span>
    <div class="status-notice-body">
      <strong v-if="title" class="status-notice-title">{{ title }}</strong>
      <div v-if="$slots.default" class="status-notice-copy"><slot /></div>
      <div v-if="$slots.actions" class="status-notice-actions"><slot name="actions" /></div>
    </div>
    <div v-if="$slots.meta" class="status-notice-meta"><slot name="meta" /></div>
  </div>
</template>
