<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowUpRight, FolderOpen, Check, Info, ArrowRight } from 'lucide-vue-next'
import { difficultyLabels, difficultyDescriptions, projectTypeLabels } from '@defense/shared'
import { useProjectsStore } from '../stores/projects'
import JudgeWorkbench from '../components/judges/JudgeWorkbench.vue'
import StorageNotice from '../components/StorageNotice.vue'
const route = useRoute()
const projects = useProjectsStore()
const selectedId = computed(() =>
  typeof route.query.project === 'string' ? route.query.project : '',
)
const selected = computed(() => projects.findProject(selectedId.value))
</script>
<template>
  <RouterLink to="/" class="back-link"><ArrowLeft :size="15" />返回总览</RouterLink>
  <div class="view-heading">
    <div class="eyebrow"><span></span>PREPARE BEFORE YOU PERFORM</div>
    <h1>每一次从容，都有准备。</h1>
    <p>选择一份项目资料，梳理你的答辩起点。</p>
  </div>
  <div class="notice preparation-status">
    <Info :size="18" />
    <div>
      <strong>当前可用：项目建档、画像分析与四角色提问</strong>
      <p>
        先在项目详情生成画像，再选择评委提问。模拟模式需主动选择并明确标注；动态追问与评分将在后续阶段接入。
      </p>
    </div>
  </div>
  <StorageNotice />
  <div v-if="!projects.loaded && !projects.loadError" class="empty-state" role="status">
    正在读取本地项目…
  </div>
  <template v-else-if="!projects.loadError">
    <div v-if="selected" class="selected-project-panel">
      <div>
        <span class="section-kicker">YOUR SELECTED PROJECT</span>
        <h2>{{ selected.name }}</h2>
        <p class="selected-description">{{ selected.description }}</p>
        <div class="detail-meta">
          <span>{{ projectTypeLabels[selected.projectType] }}</span
          ><span class="difficulty-tag">{{ difficultyLabels[selected.difficulty] }}难度</span>
        </div>
      </div>
      <div class="selected-project-actions">
        <RouterLink
          :to="{ name: 'project-detail', params: { id: selected.id } }"
          class="app-button button-secondary"
          >查看项目资料<ArrowUpRight :size="15" /></RouterLink
        ><RouterLink to="/defense" class="text-button"
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
      <div v-if="selectedId" class="notice notice-error" role="alert">
        <p>未找到所选项目，记录可能已被清除。请重新选择或创建项目。</p>
      </div>
      <div class="section-heading">
        <div>
          <div class="section-kicker">CHOOSE YOUR PROJECT</div>
          <h2>本轮，想打磨哪个项目？</h2>
        </div>
        <RouterLink to="/projects/new" class="section-action"
          >创建新项目<ArrowUpRight :size="14"
        /></RouterLink>
      </div>
      <div v-if="projects.projects.length" class="project-picker">
        <RouterLink
          v-for="project in projects.projects"
          :key="project.id"
          :to="{ name: 'defense', query: { project: project.id } }"
          class="project-choice"
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
      <div v-else class="empty-state">
        <FolderOpen :size="30" />
        <h2>先给你的想法，建立一份档案。</h2>
        <p>还没有项目资料。填写并保存后，就可以在这里进入准备。</p>
        <RouterLink to="/projects/new" class="app-button button-primary"
          >创建第一个项目<ArrowUpRight :size="16"
        /></RouterLink>
      </div>
    </template>
    <JudgeWorkbench :project="selected" />
  </template>
</template>
