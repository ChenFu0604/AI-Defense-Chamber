<script setup lang="ts">
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
    class="app-button"
    :class="'button-' + variant"
  >
    <slot />
  </button>
</template>
