<script setup lang="ts">
import type { DefenseMessage, ReportReference } from '@defense/shared'
defineProps<{ references: ReportReference[]; messages: DefenseMessage[] }>()
</script>
<template>
  <blockquote v-for="(reference, index) in references" :key="index" class="report-reference">
    <a class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" :href="'#answer-' + reference.messageId"
      >回答 #{{
        messages.filter((v) => v.sender === 'user').findIndex((v) => v.id === reference.messageId) +
        1
      }}</a
    >
    「{{ reference.quote }}」
  </blockquote>
</template>
