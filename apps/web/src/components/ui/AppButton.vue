<script setup lang="ts">
import AeroDecor from './AeroDecor.vue'
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    disabled?: boolean
    busy?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', disabled: false, busy: false, type: 'button' },
)
</script>
<template>
  <button
    :type="type"
    :disabled="disabled || busy"
    :aria-busy="busy || undefined"
    class="app-button group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
    :class="'button-' + variant"
  >
    <AeroDecor :orbs="false" />
    <slot />
  </button>
</template>
