<script setup lang="ts">
import { computed } from 'vue'
import { useRequestElapsed } from '../../composables/useRequestElapsed'
const props = defineProps<{active: boolean; requestKey?: string; label?: string}>()
const seconds = useRequestElapsed(computed(() => props.active), computed(() => props.requestKey))
</script>
<template>
  <div v-if="active" class="request-wait">
    <span>{{ label || '正在等待模型返回' }} · 本页已等待 {{ seconds }} 秒</span>
    <p v-if="seconds >= 30" role="status">这次响应较慢，仍在等待服务返回。请勿重复提交；失败后会显示重试入口。此计时不是完成进度。</p>
  </div>
</template>
