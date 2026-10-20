<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CalendarDays,
  FolderOpen,
  ShieldCheck,
} from 'lucide-vue-next'
import { projectTypeLabels, difficultyLabels, difficultyDescriptions } from '@defense/shared'
import { useProjectsStore } from '../stores/projects'
import { projectTextFields } from '../data/project-form'
import { formatProjectDate } from '../utils/project-format'
import StorageNotice from '../components/StorageNotice.vue'
import ProjectAnalysisPanel from '../components/analysis/ProjectAnalysisPanel.vue'
import { useAnalysisStore } from '../stores/analysis'
import AttachmentGallery from '../components/attachments/AttachmentGallery.vue'
const analyses = useAnalysisStore()
const route = useRoute()
const projects = useProjectsStore()
const project = computed(() => projects.findProject(String(route.params.id)))
const analysisStatus = computed(() => {
  if (!project.value) return '待分析'
  const state = analyses.stateFor(project.value.id)
  return state.live ? '真实画像已生成' : state.demo ? '仅模拟示例' : '待分析'
})
</script>
<template>
  <RouterLink to="/#projects" class="back-link"><ArrowLeft :size="15" />返回最近项目</RouterLink>
  <StorageNotice />
  <div v-if="!projects.loaded && !projects.loadError" class="empty-state" role="status">
    正在读取项目…
  </div>
  <template v-else-if="project">
    <div class="detail-heading">
      <div>
        <div class="eyebrow"><span></span>YOUR PROJECT, IN FOCUS</div>
        <h1>{{ project.name }}</h1>
        <div class="detail-meta">
          <span><FolderOpen :size="14" />{{ projectTypeLabels[project.projectType] }}</span
          ><span
            ><CalendarDays :size="14" /><time :datetime="project.createdAt">{{
              formatProjectDate(project.createdAt)
            }}</time></span
          ><span class="difficulty-tag">{{ difficultyLabels[project.difficulty] }}难度</span>
        </div>
      </div>
      <RouterLink
        :to="{ name: 'defense', query: { project: project.id } }"
        class="app-button button-primary"
        >开始答辩<ArrowUpRight :size="17"
      /></RouterLink>
    </div>
    <div class="notice notice-success">
      <CheckCircle2 :size="18" />
      <div>
        <strong>项目资料已保存在此浏览器</strong>
        <p>你可以刷新页面或返回首页再次查看，并通过下方功能生成项目画像。</p>
      </div>
    </div>
    <ProjectAnalysisPanel :project="project" />
    <section v-if="project.attachments?.length" class="history-card">
      <h2>项目图片与文档</h2>
      <AttachmentGallery :items="project.attachments" />
    </section>
    <p v-if="projects.historyWarning" class="notice" role="status">{{ projects.historyWarning }}</p>
    <div class="defense-actions">
      <RouterLink
        :to="{ name: 'project-risks', params: { id: project.id } }"
        class="app-button button-secondary"
        >查看项目漏洞地图<ArrowUpRight :size="16" /></RouterLink
      ><RouterLink
        v-if="analyses.stateFor(project.id).demo"
        :to="{ name: 'project-risks', params: { id: project.id }, query: { mode: 'demo' } }"
        class="text-button"
        >查看已保存模拟画像的地图（模拟）</RouterLink
      >
    </div>
    <div class="detail-layout">
      <div class="detail-sections">
        <section v-for="field in projectTextFields" :key="field.key" class="detail-section">
          <h2>{{ field.label }}</h2>
          <p>{{ project[field.key] }}</p>
        </section>
      </div>
      <aside class="detail-side">
        <div class="preparation-card">
          <span class="section-kicker">READY FOR THE NEXT STEP</span>
          <h2>准备好迎接提问。</h2>
          <p>资料填写完成后，先从四种评委视角梳理需要补充的证据。</p>
          <dl>
            <div>
              <dt>项目资料</dt>
              <dd class="positive-text">已填写</dd>
            </div>
            <div>
              <dt>答辩难度</dt>
              <dd>{{ difficultyLabels[project.difficulty] }}</dd>
            </div>
            <div>
              <dt>AI 项目分析</dt>
              <dd>{{ analysisStatus }}</dd>
            </div>
          </dl>
          <p class="difficulty-description">{{ difficultyDescriptions[project.difficulty] }}</p>
          <RouterLink :to="{ name: 'defense', query: { project: project.id } }" class="text-button"
            >进入答辩准备<ArrowRight :size="14"
          /></RouterLink>
        </div>
        <p class="local-storage-note">
          <ShieldCheck :size="16" /><span
            >资料仅保存在当前浏览器，更换设备或清除浏览器数据后无法读取。</span
          >
        </p>
        <RouterLink to="/projects/new" class="text-button"
          >再创建一个项目<ArrowUpRight :size="14"
        /></RouterLink>
      </aside>
    </div>
  </template>
  <div v-else-if="!projects.loadError" class="empty-state missing-project">
    <FolderOpen :size="32" />
    <h1>这里没有找到该项目。</h1>
    <p>记录可能在另一个浏览器中，或已被清除。你可以返回首页查看其他项目。</p>
    <div class="empty-actions">
      <RouterLink to="/#projects" class="app-button button-secondary">查看已有项目</RouterLink
      ><RouterLink to="/projects/new" class="app-button button-primary"
        >创建项目<ArrowUpRight :size="15"
      /></RouterLink>
    </div>
  </div>
</template>
