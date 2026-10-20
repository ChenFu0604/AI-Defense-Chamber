<script setup lang="ts">
defineProps<{ compact?: boolean }>()
</script>
<template>
  <RouterLink to="/" class="brand" aria-label="AI 答辩压力舱首页">
    <span class="brand-symbol"
      ><svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M20 7 31 13v14l-11 6-11-6V13Z" stroke="currentColor" stroke-width="2" />
        <path d="m15 24 5-11 5 11m-8-4h6" stroke="currentColor" stroke-width="2" /></svg
    ></span>
    <span v-if="!compact" class="brand-copy"
      ><strong>答辩压力舱<span class="brand-ai">AI</span></strong
      ><small>DEFENSE CHAMBER</small></span
    >
  </RouterLink>
</template>
