<script setup lang="ts">
import { ArrowUpRight, FolderOpen, CalendarDays } from 'lucide-vue-next'
import { projectTypeLabels, difficultyLabels, type Project } from '@defense/shared'
import { formatProjectDate } from '../utils/project-format'
defineProps<{ project: Project }>()
</script>
<template>
  <article class="project-card surface-panel">

    <div class="project-card-top">
      <span class="project-card-icon"><FolderOpen :size="20" /></span
      ><span class="project-type-tag">{{ projectTypeLabels[project.projectType] }}</span>
    </div>
    <h3>
      <RouterLink :to="{ name: 'project-detail', params: { id: project.id } }">{{
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
      class="project-card-link control-button"
      :aria-label="'查看项目：' + project.name"
      >
      查看项目<ArrowUpRight :size="15"
    /></RouterLink>
  </article>
</template>
