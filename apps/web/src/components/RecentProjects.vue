<script setup lang="ts">
import AeroDecor from './ui/AeroDecor.vue'
import { FolderPlus, ArrowUpRight, Plus } from 'lucide-vue-next'
import { useProjectsStore } from '../stores/projects'
import ProjectCard from './ProjectCard.vue'
import StorageNotice from './StorageNotice.vue'
import StatusNotice from './ui/StatusNotice.vue'
const projects = useProjectsStore()
</script>
<template>
  <section id="projects" class="recent-projects" aria-labelledby="recent-projects-title">
    <div class="section-heading">
      <div>
        <h2 id="recent-projects-title">
          最近的项目<span>{{ projects.activeProjects.length.toString().padStart(2, '0') }}</span>
        </h2>
      </div>
      <RouterLink to="/projects/new" class="section-action focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"><Plus :size="14" />创建项目</RouterLink>
    </div>
    <StorageNotice />
    <StatusNotice v-if="!projects.loaded && !projects.loadError" busy compact>正在读取本地项目…</StatusNotice>
    <div
      v-else-if="projects.loaded && !projects.loadError && projects.activeProjects.length === 0"
      class="empty-state aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out"
    >
      <AeroDecor />
      <span class="empty-state-icon"><FolderPlus :size="26" :stroke-width="1.4" /></span>
      <h3>{{ projects.projects.length ? '项目都已归档，准备开始新的练习吗？' : '从一个想法，开始你的第一次练习。' }}</h3>
      <p>{{ projects.projects.length ? '可以创建新项目，也可以到“我的项目”中恢复归档项目。' : '填写项目资料，或导入已有文档，随后就能开始和评委交流。' }}</p>
      <RouterLink to="/projects/new" class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
        >
      <AeroDecor :orbs="false" />{{ projects.projects.length ? '创建新项目' : '创建第一个项目' }}<ArrowUpRight :size="15" /></RouterLink
      ><small>资料保存在当前浏览器，无需账号。</small>
    </div>
    <div v-if="projects.recentProjects.length" class="project-grid">
      <ProjectCard
        v-for="project in projects.recentProjects"
        :key="project.id"
        :project="project"
      />
    </div>
    <p class="section-footnote">
      展示最近创建的未归档项目。<RouterLink class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" to="/projects">查看全部项目与草稿 →</RouterLink>
    </p>
  </section>
</template>
