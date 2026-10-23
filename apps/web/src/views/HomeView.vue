<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  FileText,
  MessagesSquare,
  ChartNoAxesCombined,
} from 'lucide-vue-next'
import JudgeCard from '../components/JudgeCard.vue'
import RecentProjects from '../components/RecentProjects.vue'
import ContinueWorkspace from '../components/ContinueWorkspace.vue'
import { judges } from '../data/judges'

const features = [
  {
    icon: FileText,
    title: '让项目有一份清晰画像',
    description: '保存项目资料，分析核心价值、可行性与风险，核对需要补充的证据。',
    to: '/projects',
    action: '整理项目',
  },
  {
    icon: MessagesSquare,
    title: '迎接不同立场的追问',
    description: '从商业、技术、用户与逻辑四个方向，检验回答中的假设与证据。',
    to: '/defense',
    action: '开始训练',
  },
  {
    icon: ChartNoAxesCombined,
    title: '把薄弱点变成下一步',
    description: '用五维能力报告与风险关联图，将答辩反馈转为可以执行的改进建议。',
    to: '/history',
    action: '查看历史',
  },
]
</script>
<template>
  <div class="home-view">
    <header class="workspace-welcome aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out" aria-labelledby="hero-title">
      <AeroDecor />
      <div class="workspace-welcome-copy">
        <h1 id="hero-title">把项目讲清楚，<span>从一次练习开始。</span></h1>
        <p>整理想法、和评委交流，再把反馈变成下一步。</p>
      </div>
      <div class="workspace-welcome-actions">
        <RouterLink to="/projects/new" class="app-button button-primary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />创建项目<ArrowUpRight :size="18" /></RouterLink>
        <RouterLink to="/defense" class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />开始答辩<ArrowRight :size="16" /></RouterLink>
      </div>
    </header>
    <ContinueWorkspace />
    <RecentProjects />
    <div class="home-guidance-grid">
      <aside id="workflow" class="practice-preview aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out" aria-label="训练流程说明">
      <AeroDecor />
        <div class="preview-heading"><span class="preview-square"><MessagesSquare :size="24" /></span><h2>让想法一步步清晰</h2></div>
        <ol class="preview-steps">
          <li><span>01</span><div><strong>整理项目资料</strong><p>写下想法，也可以导入已有文档。</p></div><FileText :size="19" /></li>
          <li><span>02</span><div><strong>和评委聊一聊</strong><p>一次回答一个问题，卡住时获取提示。</p></div><MessagesSquare :size="19" /></li>
          <li><span>03</span><div><strong>找到改进方向</strong><p>查看依据、薄弱点和下一步建议。</p></div><ChartNoAxesCombined :size="19" /></li>
        </ol>
        <div class="preview-note"><ShieldCheck :size="18" /><span>按自己的节奏练习。AI 反馈是训练建议，重要结论仍需核实。</span></div>
      </aside>
      <section id="features" class="workspace-shortcuts aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out" aria-labelledby="features-title">
      <AeroDecor />
        <div>
          <h2 id="features-title">今天想先做什么？</h2>
        </div>
        <RouterLink v-for="feature in features" :key="feature.title" :to="feature.to" class="workspace-shortcut focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
          <span class="shortcut-icon"><component :is="feature.icon" :size="22" /></span>
          <span><strong>{{ feature.title }}</strong><span>{{ feature.description }}</span><small>{{ feature.action }} →</small></span>
          <ArrowUpRight :size="18" />
        </RouterLink>
      </section>
    </div>
    <section id="judges" class="judges-section" aria-labelledby="judges-title">
      <div class="section-heading">
        <div>
          <h2 id="judges-title">四种视角，帮你想得更清楚。</h2>
        </div>
        <span class="section-meta">评委角色与提问示例 <span class="preview-chip">预览</span></span>
      </div>
      <div class="judges-grid">
        <JudgeCard v-for="judge in judges" :key="judge.id" :judge="judge" />
      </div>
    </section>
  </div>
</template>
