<script setup lang="ts">
import { FolderPlus, ArrowUpRight, Plus } from 'lucide-vue-next'
import { useProjectsStore } from '../stores/projects'
import ProjectCard from './ProjectCard.vue'
import StorageNotice from './StorageNotice.vue'
const projects = useProjectsStore()
</script>
<template>
  <section id="projects" class="recent-projects" aria-labelledby="recent-projects-title">
    <div class="section-heading">
      <div>
        <div class="section-kicker">YOUR NEXT GREAT DEFENSE</div>
        <h2 id="recent-projects-title">
          从你的项目开始。<span>{{ projects.projects.length.toString().padStart(2, '0') }}</span>
        </h2>
      </div>
      <RouterLink to="/projects/new" class="section-action"><Plus :size="14" />创建项目</RouterLink>
    </div>
    <StorageNotice />
    <div v-if="!projects.loaded && !projects.loadError" class="empty-state" role="status">
      正在读取本地项目…
    </div>
    <div
      v-else-if="projects.loaded && !projects.loadError && projects.projects.length === 0"
      class="empty-state"
    >
      <span class="empty-state-icon"><FolderPlus :size="26" :stroke-width="1.4" /></span>
      <h3>把你的第一个想法，放进压力舱。</h3>
      <p>填写项目资料，留下一份可以反复打磨的答辩起点。</p>
      <RouterLink to="/projects/new" class="app-button button-secondary"
        >创建第一个项目<ArrowUpRight :size="15" /></RouterLink
      ><small>资料保存在当前浏览器，无需账号。</small>
    </div>
    <div v-if="projects.recentProjects.length" class="project-grid">
      <ProjectCard
        v-for="project in projects.recentProjects"
        :key="project.id"
        :project="project"
      />
    </div>
    <p v-if="projects.projects.length > 3" class="section-footnote">
      展示最近 3 个项目。<RouterLink to="/defense">选择其他项目进入准备 →</RouterLink>
    </p>
  </section>
</template>
