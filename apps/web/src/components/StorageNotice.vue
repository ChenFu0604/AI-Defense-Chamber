<script setup lang="ts">
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
    <button type="button" class="text-button" @click="projects.loadProjects">
      <RefreshCw :size="14" />重新读取
    </button>
  </div>
</template>
