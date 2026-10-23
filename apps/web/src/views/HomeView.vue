<script setup lang="ts">
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

const shortcuts = [
  {
    icon: FileText,
    to: '/projects',
    label: '整理项目资料',
  },
  {
    icon: MessagesSquare,
    to: '/defense',
    label: '选择项目开始训练',
  },
  {
    icon: ChartNoAxesCombined,
    to: '/history',
    label: '回看历史与改进建议',
  },
]
</script>
<template>
  <div class="home-view">
    <header class="home-page-header" aria-labelledby="hero-title">
      <div>
        <h1 id="hero-title">把项目讲清楚，从一次练习开始。</h1>
        <p>整理项目、和评委聊一聊，再把反馈变成下一步。</p>
      </div>
      <div class="home-page-actions">
        <RouterLink to="/projects/new" class="app-button button-primary">
          创建项目<ArrowUpRight :size="17" />
        </RouterLink>
        <RouterLink to="/defense" class="app-button button-secondary">
          开始答辩<ArrowRight :size="16" />
        </RouterLink>
      </div>
    </header>
    <ContinueWorkspace />
    <div class="home-projects-layout">
      <RecentProjects />
      <aside id="workflow" class="home-guide" aria-label="训练流程说明">
        <h2>从这里开始</h2>
        <ol class="home-guide-steps">
          <li><span>1</span><div><strong>整理项目资料</strong><p>写下想法，也可以导入已有文档。</p></div></li>
          <li><span>2</span><div><strong>和评委聊一聊</strong><p>一次回答一个问题，卡住时获取提示。</p></div></li>
          <li><span>3</span><div><strong>找到改进方向</strong><p>回看回答的依据、薄弱点和下一步建议。</p></div></li>
        </ol>
        <p class="home-guide-note"><ShieldCheck :size="16" /><span>AI 反馈是训练建议，重要结论仍需核实。</span></p>
        <nav class="home-shortcuts" aria-label="训练快捷入口">
          <RouterLink v-for="shortcut in shortcuts" :key="shortcut.to" :to="shortcut.to">
            <span><component :is="shortcut.icon" :size="16" />{{ shortcut.label }}</span>
            <ArrowUpRight :size="15" />
          </RouterLink>
        </nav>
      </aside>
    </div>
    <section id="judges" class="judges-section" aria-labelledby="judges-title">
      <div class="section-heading">
        <div>
          <h2 id="judges-title">换个视角，想得更清楚</h2>
        </div>
        <span class="section-meta">评委角色与提问示例 <span class="preview-chip">预览</span></span>
      </div>
      <div class="judges-grid">
        <JudgeCard v-for="judge in judges" :key="judge.id" :judge="judge" />
      </div>
    </section>
  </div>
</template>
