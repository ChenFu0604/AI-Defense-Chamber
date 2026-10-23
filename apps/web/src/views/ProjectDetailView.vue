<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
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
import ProjectSnapshot from '../components/ProjectSnapshot.vue'
const analyses = useAnalysisStore()
const route = useRoute()
const projects = useProjectsStore()
const project = computed(() => projects.findProject(String(route.params.id)))
const versions = computed(() => projects.revisions.find((v) => v.projectId === project.value?.id)?.snapshots ?? [])
const analysisStatus = computed(() => {
  if (!project.value) return '待分析'
  const state = analyses.stateFor(project.value.id)
  return state.live ? '真实画像已生成' : state.demo ? '仅模拟示例' : '待分析'
})
</script>
<template>
  <div class="project-detail-page">
    <RouterLink to="/projects" class="back-link focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"><ArrowLeft :size="15" />返回我的项目</RouterLink>
    <StorageNotice />
    <StatusNotice v-if="!projects.loaded && !projects.loadError" busy compact>正在读取项目…</StatusNotice>
    <template v-else-if="project">
      <header class="detail-heading project-page-header">
        <div>

          <h1>{{ project.name }}</h1>
          <div class="detail-meta">
            <span><FolderOpen :size="14" />{{ projectTypeLabels[project.projectType] }}</span>
            <span><CalendarDays :size="14" /><time :datetime="project.createdAt">{{ formatProjectDate(project.createdAt) }}</time></span>
            <span class="difficulty-tag">{{ difficultyLabels[project.difficulty] }}难度</span>
            <span>第 {{ versions.length + 1 }} 版</span>
          </div>
        </div>
        <div class="project-header-actions">
          <RouterLink :to="{ name: 'project-edit', params: { id: project.id } }" class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />编辑资料</RouterLink>
          <RouterLink :to="{ name: 'defense', query: { project: project.id } }" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />开始答辩<ArrowUpRight :size="16" /></RouterLink>
        </div>
      </header>
      <StatusNotice tone="success" compact :announce="false">项目资料已保存在此浏览器，可刷新后继续查看。</StatusNotice>
      <StatusNotice v-if="projects.historyWarning" tone="warning" compact>{{ projects.historyWarning }}</StatusNotice>
      <nav class="project-section-nav" aria-label="项目内容导航">
        <a class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" href="#analysis">项目画像</a><a class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" href="#project-brief">项目资料</a>
        <a class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" v-if="project.attachments?.length" href="#project-attachments">附件材料</a>
        <a class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" v-if="versions.length" href="#project-versions">资料版本</a>
      </nav>
      <div class="project-overview-layout">
        <div class="project-overview-main">
          <ProjectAnalysisPanel :project="project" />
          <section id="project-brief" class="project-brief-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out" aria-labelledby="project-brief-heading">
      <AeroDecor />
            <div class="project-section-heading"><div><h2 id="project-brief-heading">项目资料</h2><p>评委将参考这些资料理解你的项目，修改后请重新生成项目画像。</p></div></div>
            <div class="detail-sections">
              <section v-for="field in projectTextFields" :key="field.key" class="detail-section">
                <h3>{{ field.label }}</h3><p>{{ project[field.key] }}</p>
              </section>
            </div>
          </section>
          <details v-if="project.attachments?.length" id="project-attachments" class="history-card project-fold-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
            <summary class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"><span>项目图片与文档</span><small>{{ project.attachments.length }} 份材料 · 展开查看</small></summary>
      <AeroDecor />
            <div class="project-fold-content"><AttachmentGallery :items="project.attachments" /></div>
          </details>
          <details v-if="versions.length" id="project-versions" class="history-card project-versions project-fold-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
            <summary class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"><span>资料版本</span><small>当前第 {{ versions.length + 1 }} 版 · {{ versions.length }} 份旧资料</small></summary>
      <AeroDecor />
            <div class="project-fold-content">
              <p>旧版只读展示；已有会话与报告不会被编辑覆盖。</p>
              <details v-for="(version, index) in versions" :key="version.updatedAt" class="history-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
                <summary class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">第 {{ index + 1 }} 版 · {{ version.name }} · {{ new Date(version.updatedAt).toLocaleString('zh-CN') }}</summary>
      <AeroDecor />
                <ProjectSnapshot :project="version" />
                <AttachmentGallery v-if="version.attachments?.length" :items="version.attachments" />
              </details>
            </div>
          </details>
        </div>
        <aside class="project-next-steps" aria-label="项目下一步操作">
          <div class="preparation-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
            <h2>开始一轮练习</h2>
            <p>先核对项目资料，再选择评委和训练目标。卡住时，可以让评委给你一些提示。</p>
            <dl>
              <div><dt>项目资料</dt><dd class="positive-text">已填写</dd></div>
              <div><dt>答辩难度</dt><dd>{{ difficultyLabels[project.difficulty] }}</dd></div>
              <div><dt>AI 项目分析</dt><dd>{{ analysisStatus }}</dd></div>
            </dl>
            <RouterLink :to="{ name: 'defense', query: { project: project.id } }" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />开始答辩<ArrowRight :size="16" /></RouterLink>
            <p class="difficulty-description">{{ difficultyDescriptions[project.difficulty] }}</p>
          </div>
          <div class="project-related-card aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
            <h2>继续了解项目</h2>
            <a class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" href="#analysis">查看或生成项目画像<ArrowUpRight :size="15" /></a>
            <RouterLink class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" :to="{ name: 'project-risks', params: { id: project.id } }">查看项目漏洞地图<ArrowUpRight :size="15" /></RouterLink>
            <RouterLink class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" v-if="analyses.stateFor(project.id).demo" :to="{ name: 'project-risks', params: { id: project.id }, query: { mode: 'demo' } }">查看已保存模拟画像的地图（模拟）<ArrowUpRight :size="15" /></RouterLink>
            <RouterLink class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" to="/projects/new">再创建一个项目<ArrowUpRight :size="15" /></RouterLink>
          </div>
          <p class="local-storage-note"><ShieldCheck :size="16" /><span>资料仅保存在当前浏览器，更换设备或清除浏览器数据后无法读取。</span></p>
        </aside>
      </div>
    </template>
    <div v-else-if="!projects.loadError" class="empty-state missing-project aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
      <FolderOpen :size="32" /><h1>这里没有找到该项目。</h1>
      <p>记录可能在另一个浏览器中，或已被清除。你可以返回我的项目查看其他项目。</p>
      <div class="empty-actions"><RouterLink to="/projects" class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />查看已有项目</RouterLink><RouterLink to="/projects/new" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />创建项目<ArrowUpRight :size="15" /></RouterLink></div>
    </div>
  </div>
</template>
