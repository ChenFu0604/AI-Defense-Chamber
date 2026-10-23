<script setup lang="ts">
import AeroDecor from './ui/AeroDecor.vue'
import { onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { useSystemStore } from '../stores/system'
const system = useSystemStore()
onMounted(() => {
  if (!system.health) void system.checkHealth()
})
</script>
<template>
  <div class="service-status" aria-live="polite">
    <span class="status-dot" :class="{ online: system.health, offline: system.error }"></span>
    <span>{{
      system.checking
        ? '正在检查服务'
        : system.health
          ? '基础服务已连接'
          : system.error
            ? '基础服务未连接'
            : '等待服务检查'
    }}</span>
    <button
      class="icon-button aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
      :disabled="system.checking"
      :title="system.error || '重新检查服务连接'"
      aria-label="重新检查服务连接"
      @click="system.checkHealth"
    >
      <AeroDecor :orbs="false" />
      <RefreshCw :size="13" :class="{ spinning: system.checking }" />
    </button>
  </div>
</template>
