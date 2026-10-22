<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '../ui/AppButton.vue'
import { useEndDefense } from '../../composables/useEndDefense'
const props = defineProps<{disabled: boolean; hasDraft: boolean; hasPendingAnswer: boolean}>()
const emit = defineEmits<{end: []}>()
const {confirming, request, cancel, confirm} = useEndDefense(computed(() => props.disabled), () => emit('end'))
</script>
<template>
  <div class="end-defense-control">
    <AppButton v-if="!confirming" variant="secondary" :disabled="disabled" @click="request">结束本场训练</AppButton>
    <div v-else class="end-defense-confirm" role="group" aria-label="确认结束训练">
      <strong>结束后，本场不能再追加回答。</strong>
      <p v-if="hasPendingAnswer">已提交的回答会保留，尚未完成的追问或评价不会补造。你也可以返回重试。</p>
      <p v-else-if="hasDraft">输入区还有未提交的内容，不会计入本场记录。可以返回先提交；结束后也可以复制保留的草稿。</p>
      <p v-else>已提交的问答会保留，你可以查看小结，或生成诊断报告。</p>
      <div class="defense-actions"><AppButton :disabled="disabled" @click="confirm">确认结束</AppButton><AppButton variant="ghost" :disabled="disabled" @click="cancel">继续训练</AppButton></div>
    </div>
  </div>
</template>
