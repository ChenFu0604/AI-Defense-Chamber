<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  ArrowLeft,
  ArrowUpRight,
  FolderOpen,
  Check,
  ArrowRight,
  ScanEye,
  ChevronDown,
} from 'lucide-vue-next'
import { difficultyLabels, difficultyDescriptions, projectTypeLabels } from '@defense/shared'
import { useProjectsStore } from '../stores/projects'
import JudgeWorkbench from '../components/judges/JudgeWorkbench.vue'
import DefenseStartPanel from '../components/defense/DefenseStartPanel.vue'
import StorageNotice from '../components/StorageNotice.vue'
const route = useRoute()
const projects = useProjectsStore()
const selectedId = computed(() =>
  typeof route.query.project === 'string' ? route.query.project : '',
)
const selected = computed(() => projects.findProject(selectedId.value))
</script>
<template>
  <RouterLink to="/" class="back-link focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"><ArrowLeft :size="15" />返回总览</RouterLink>
  <div class="view-heading">

    <h1>{{ selected ? '设置这一次练习' : '选择要练习的项目' }}</h1>
    <p>{{ selected ? '确认资料，选择练习方式和评委，然后按自己的节奏开始。' : '使用已有项目继续打磨，或者创建一份新的项目资料。' }}</p>
  </div>
  <StorageNotice />
  <StatusNotice v-if="!projects.loaded && !projects.loadError" busy compact>
    正在读取本地项目…
  </StatusNotice>
  <template v-else-if="!projects.loadError">
    <div :class="{ 'preparation-layout': selected }">
    <div v-if="selected" class="selected-project-panel aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
      <div>
        <span class="section-kicker">本轮使用的项目资料</span>
        <h2>{{ selected.name }}</h2>
        <p class="selected-description">{{ selected.description }}</p>
        <div class="detail-meta">
          <span>{{ projectTypeLabels[selected.projectType] }}</span
          ><span class="difficulty-tag">{{ difficultyLabels[selected.difficulty] }}难度</span>
        </div>
      </div>
      <div class="selected-project-actions">
        <RouterLink :to="{ name: 'project-edit', params: { id: selected.id }, query: { prepare: '1' } }" class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />编辑后回到训练</RouterLink>
        <RouterLink
          :to="{ name: 'project-detail', params: { id: selected.id } }"
          class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          >
      <AeroDecor :orbs="false" />查看项目资料<ArrowUpRight :size="15" /></RouterLink
        ><RouterLink to="/defense" class="text-button focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          >切换项目<ArrowRight :size="14"
        /></RouterLink>
      </div>
      <div class="selected-checklist">
        <p><Check :size="15" />项目资料已保存</p>
        <p><Check :size="15" />已选择{{ difficultyLabels[selected.difficulty] }}难度</p>
        <span>{{ difficultyDescriptions[selected.difficulty] }}</span>
      </div>
    </div>
    <template v-else>
      <StatusNotice v-if="selectedId" tone="error" compact>未找到所选项目，记录可能已被清除。请重新选择或创建项目。</StatusNotice>
      <div class="section-heading">
        <div>

          <h2>本轮，想打磨哪个项目？</h2>
        </div>
        <RouterLink to="/projects/new" class="section-action focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          >创建新项目<ArrowUpRight :size="14"
        /></RouterLink>
      </div>
      <div v-if="projects.activeProjects.length" class="project-picker">
        <RouterLink
          v-for="project in projects.activeProjects"
          :key="project.id"
          :to="{ name: 'defense', query: { project: project.id } }"
          class="project-choice focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          ><FolderOpen :size="23" />
          <div>
            <h3>{{ project.name }}</h3>
            <p>
              {{ projectTypeLabels[project.projectType] }} ·
              {{ difficultyLabels[project.difficulty] }}难度
            </p>
          </div>
          <span>选用项目<ArrowUpRight :size="16" /></span
        ></RouterLink>
      </div>
      <div v-else class="empty-state aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
        <FolderOpen :size="30" />
        <h2>先给你的想法，建立一份档案。</h2>
        <p>还没有项目资料。填写并保存后，就可以在这里进入准备。</p>
        <RouterLink to="/projects/new" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          >
      <AeroDecor :orbs="false" />创建第一个项目<ArrowUpRight :size="16"
        /></RouterLink>
      </div>
    </template>
    <DefenseStartPanel v-if="selected" :key="selected.id" :project="selected" />
    </div>
    <details class="defense-preview aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <summary class="defense-preview-heading focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
        <span class="defense-preview-icon"><ScanEye :size="21" /></span>
        <span class="defense-preview-title"
          ><strong>单轮评委预览与角色规则</strong
          ><span>了解四种评审视角，预览针对项目画像的提问</span></span
        >
        <span class="defense-preview-toggle"
          ><span class="preview-open-label">展开预览</span
          ><span class="preview-close-label">收起预览</span><ChevronDown :size="17"
        /></span>
      </summary>
      <AeroDecor />
      <JudgeWorkbench :project="selected" />
    </details>
  </template>
</template>
