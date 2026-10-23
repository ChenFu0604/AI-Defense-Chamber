<script setup lang="ts">
import { computed } from 'vue'
import { useRequestElapsed } from '../../composables/useRequestElapsed'
import StatusNotice from './StatusNotice.vue'
const props = defineProps<{active: boolean; requestKey?: string; label?: string; description?: string; embedded?: boolean}>()
const seconds = useRequestElapsed(computed(() => props.active), computed(() => props.requestKey))
</script>
<template>
  <div v-if="active" class="request-wait-host">
    <div v-if="embedded" class="request-wait is-embedded">
      <div class="request-wait-line"><span>等待服务响应</span><span class="request-wait-time" aria-hidden="true">本页已等待 <b>{{ seconds }}</b> 秒</span></div>
      <p class="request-wait-hint">{{ seconds >= 30 ? '响应比平时慢，请继续等待；失败后会显示重试入口。' : '无需重复提交，完成后会自动更新。' }}</p>
    </div>
    <StatusNotice v-else class="request-wait" :title="label || '正在等待模型返回'" busy :announce="false">
      <template #meta><span class="request-wait-time" aria-hidden="true">本页已等待 <b>{{ seconds }}</b> 秒</span></template>
      <p>{{ description || '请求已发出，收到并核对结果后会自动更新。' }}</p>
      <p class="request-wait-hint">{{ seconds >= 30 ? '响应比平时慢，请继续等待；失败后会显示重试入口。' : '无需重复提交，等待时间不代表完成进度。' }}</p>
    </StatusNotice>
    <span v-if="!embedded" class="sr-only" role="status">{{ seconds >= 30 ? '响应较慢，仍在等待服务返回。' : label || '正在等待模型返回。' }}</span>
  </div>
</template>
