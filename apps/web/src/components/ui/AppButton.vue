<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', disabled: false, type: 'button' },
)
</script>
<template>
  <button :type="type" :disabled="disabled" class="app-button" :class="'button-' + variant">
    <slot />
  </button>
</template>
