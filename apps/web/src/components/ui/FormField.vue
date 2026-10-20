<script setup lang="ts">
withDefaults(
  defineProps<{ id: string; label: string; hint?: string; error?: string; required?: boolean }>(),
  { required: true },
)
</script>
<template>
  <div class="form-field" :class="{ 'has-error': error }">
    <label :for="id"
      >{{ label }}<span v-if="required" class="required-mark" aria-hidden="true">*</span></label
    >
    <p v-if="hint" :id="id + '-hint'" class="field-hint">{{ hint }}</p>
    <slot />
    <p v-if="error" :id="id + '-error'" class="field-error">{{ error }}</p>
  </div>
</template>
