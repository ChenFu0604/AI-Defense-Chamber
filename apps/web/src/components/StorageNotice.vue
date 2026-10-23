<script setup lang="ts">
import AeroDecor from './ui/AeroDecor.vue'
import { AlertCircle, RefreshCw } from 'lucide-vue-next'
import { useProjectsStore } from '../stores/projects'
const projects = useProjectsStore()
</script>
<template>
  <div v-if="projects.loadError" class="notice notice-error storage-notice" role="alert">
    <AlertCircle :size="18" />
    <div>
      <strong>暂时无法读取项目</strong>
      <p>{{ projects.loadError }}</p>
    </div>
    <button type="button" class="text-button aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" @click="projects.loadProjects">
      <AeroDecor :orbs="false" />
      <RefreshCw :size="14" />重新读取
    </button>
  </div>
</template>
