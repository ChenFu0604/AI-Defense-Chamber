<script setup lang="ts">
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Activity,
  ScanLine,
  AudioLines,
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
    status: '已开放',
    available: true,
  },
  {
    icon: MessagesSquare,
    title: '迎接不同立场的追问',
    description: '从商业、技术、用户与逻辑四个方向，检验回答中的假设与证据。',
    status: '已开放',
    available: true,
  },
  {
    icon: ChartNoAxesCombined,
    title: '把薄弱点变成下一步',
    description: '用五维能力报告与风险关联图，将答辩反馈转为可以执行的改进建议。',
    status: '已开放',
    available: true,
  },
]
const steps = [
  { number: '01', title: '放入你的项目', description: '填写并保存项目资料，梳理核心价值。' },
  { number: '02', title: '直面多维追问', description: '四种评审视角，找到被忽略的关键问题。' },
  { number: '03', title: '带着答案再出发', description: '用诊断与改进建议，为下一次答辩做准备。' },
]
</script>
<template>
  <div class="home-view">
    <ContinueWorkspace />
    <div class="page-heading">
      <div>
        <div class="eyebrow"><span></span>THE REHEARSAL BEFORE THE REAL THING</div>
        <p>每一场从容的答辩，都从充分准备开始。</p>
      </div>
      <span class="edition-label">为下一次上场而准备 <ArrowUpRight :size="14" /></span>
    </div>
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <div class="hero-label">
          <span class="status-dot"></span>AI 答辩压力舱<span class="mini-line"></span>DEFENSE
          CHAMBER
        </div>
        <h1 id="hero-title">
          让最难的问题，<br />发生在<span class="accent-text">上场之前。</span>
        </h1>
        <p class="hero-description">
          你可以骗过自己，但你骗不过答辩压力舱。<br />让四位不同立场的 AI
          评委，帮你重新审视项目的每一个关键假设。
        </p>
        <div class="hero-actions">
          <RouterLink to="/projects/new" class="app-button button-primary"
            >创建项目<ArrowUpRight :size="18"
          /></RouterLink>
          <RouterLink to="/defense" class="app-button button-secondary"
            >开始答辩<ArrowRight :size="16"
          /></RouterLink>
        </div>
        <div class="hero-footnote">
          <span class="footnote-avatars"><i>商</i><i>技</i><i>用</i><i>魔</i></span
          ><span>四种视角，一个更经得起推敲的项目。</span>
        </div>
      </div>
      <div class="chamber-visual" aria-label="答辩压力舱概念示意，非真实训练状态" role="img">
        <div class="visual-grid"></div>
        <div class="orbit-ring ring-outer"></div>
        <div class="orbit-ring ring-middle"></div>
        <div class="orbit-ring ring-inner"></div>
        <div class="orbit-axis axis-one"></div>
        <div class="orbit-axis axis-two"></div>
        <span class="orbit-point point-one"></span><span class="orbit-point point-two"></span
        ><span class="orbit-point point-three"></span>
        <div class="visual-caption">
          <ScanLine :size="14" />PROJECT PRESSURE SCAN<span>CONCEPT</span>
        </div>
        <div class="chamber-core">
          <div class="core-top"></div>
          <div class="core-front">
            <AudioLines :size="52" :stroke-width="1.1" /><span>DC—01</span>
          </div>
          <div class="core-side"></div>
          <div class="core-glow"></div>
        </div>
        <div class="orbit-label orbit-label-one">
          <span class="tiny-square mint-bg"></span>商业价值
        </div>
        <div class="orbit-label orbit-label-two">
          <span class="tiny-square cyan-bg"></span>技术可行性
        </div>
        <div class="orbit-label orbit-label-three">
          <span class="tiny-square violet-bg"></span>用户需求
        </div>
        <div class="orbit-label orbit-label-four">
          <span class="tiny-square rose-bg"></span>逻辑与证据
        </div>
        <div class="visual-bottom">
          <span>QUESTION. REFLECT. EVOLVE.</span><Activity :size="17" />
        </div>
      </div>
    </section>
    <div class="context-strip">
      <span><ShieldCheck :size="16" />为真实答辩而练习</span><i></i>
      <p>适用于创新创业 · 大创项目 · 毕业答辩 · 项目路演</p>
      <span class="strip-label">准备充分，才有底气。<ArrowUpRight :size="15" /></span>
    </div>
    <RecentProjects />
    <section id="features" class="features-section" aria-labelledby="features-title">
      <div class="section-heading">
        <div>
          <div class="section-kicker">BEYOND A PRACTICE CONVERSATION</div>
          <h2 id="features-title">从项目梳理，到有据可循的改进。</h2>
        </div>
        <RouterLink to="/#workflow" class="section-action"
          >了解训练流程<ArrowRight :size="14"
        /></RouterLink>
      </div>
      <div class="feature-grid">
        <article v-for="feature in features" :key="feature.title" class="feature-card">
          <div>
            <component :is="feature.icon" :size="21" /><span
              class="feature-status"
              :class="{ available: feature.available }"
              >{{ feature.status }}</span
            >
          </div>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.description }}</p>
        </article>
      </div>
    </section>
    <section id="judges" class="judges-section" aria-labelledby="judges-title">
      <div class="section-heading">
        <div>
          <div class="section-kicker">A DIFFERENT KIND OF PANEL</div>
          <h2 id="judges-title">好的项目，经得起不同的目光。<span>04</span></h2>
        </div>
        <span class="section-meta">评委角色与提问示例 <span class="preview-chip">预览</span></span>
      </div>
      <div class="judges-grid">
        <JudgeCard v-for="judge in judges" :key="judge.id" :judge="judge" />
      </div>
    </section>
    <section id="workflow" class="workflow-section" aria-labelledby="workflow-title">
      <div class="workflow-intro">
        <div class="section-kicker">FROM IDEA TO CONFIDENCE</div>
        <h2 id="workflow-title">每一轮，都更进一步。</h2>
        <p>三步构建你的答辩训练闭环。</p>
        <span class="planned-tag">项目建档 → 多轮答辩 → 报告与二次训练</span>
      </div>
      <div class="workflow-steps">
        <article v-for="step in steps" :key="step.number" class="workflow-step">
          <span>{{ step.number }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
          <ArrowUpRight :size="18" />
        </article>
      </div>
    </section>
  </div>
</template>
