<script setup lang="ts">
import AeroDecor from './ui/AeroDecor.vue'
import { ArrowUpRight, FolderOpen, CalendarDays } from 'lucide-vue-next'
import { projectTypeLabels, difficultyLabels, type Project } from '@defense/shared'
import { formatProjectDate } from '../utils/project-format'
defineProps<{ project: Project }>()
</script>
<template>
  <article class="project-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
    <div class="project-card-top">
      <span class="project-card-icon"><FolderOpen :size="20" /></span
      ><span class="project-type-tag">{{ projectTypeLabels[project.projectType] }}</span>
    </div>
    <h3>
      <RouterLink class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" :to="{ name: 'project-detail', params: { id: project.id } }">{{
        project.name
      }}</RouterLink>
    </h3>
    <p class="project-card-description">{{ project.description }}</p>
    <div class="project-card-meta">
      <span
        ><CalendarDays :size="12" /><time :datetime="project.createdAt">{{
          formatProjectDate(project.createdAt)
        }}</time></span
      ><span>{{ difficultyLabels[project.difficulty] }}</span>
    </div>
    <RouterLink
      :to="{ name: 'project-detail', params: { id: project.id } }"
      class="project-card-link aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
      :aria-label="'查看项目：' + project.name"
      >
      <AeroDecor :orbs="false" />查看项目<ArrowUpRight :size="15"
    /></RouterLink>
  </article>
</template>
