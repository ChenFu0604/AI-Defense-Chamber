<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  ArrowUpRight,
  LayoutDashboard,
  Orbit,
  Route,
  BookOpen,
  ShieldCheck,
  ChevronRight,
  Plus,
  FolderOpen,
  Settings,
} from 'lucide-vue-next'
import BrandMark from '../components/BrandMark.vue'
import HealthStatus from '../components/HealthStatus.vue'
import StageDialog from '../components/StageDialog.vue'
import { useProjectSync } from '../composables/useProjectSync'

useProjectSync()
const route = useRoute()
const title = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : '总览'))
const stageDialog = ref<InstanceType<typeof StageDialog> | null>(null)
</script>
<template>
  <a href="#main-content" class="skip-link">跳到主要内容</a>
  <div class="app-shell">
    <aside class="sidebar">
      <BrandMark />
      <div class="workspace-label">你的答辩准备空间 <span>BETA</span></div>
      <RouterLink
        to="/projects/new"
        class="app-button button-primary sidebar-create"
        aria-label="创建项目"
        ><Plus :size="16" /><span>创建项目</span></RouterLink
      >
      <nav class="side-nav" aria-label="主导航">
        <RouterLink
          to="/history"
          class="nav-item nav-history"
          :class="{ active: route.path.startsWith('/history') }"
          aria-label="历史记录与二次训练"
          ><BookOpen :size="18" />历史记录</RouterLink
        >
        <RouterLink to="/" class="nav-item" :class="{ active: route.name === 'home' }"
          ><LayoutDashboard :size="18" />总览<span
            v-if="route.name === 'home'"
            class="nav-active-dot"
          ></span
        ></RouterLink>
        <RouterLink to="/#projects" class="nav-item nav-shortcut"
          ><FolderOpen :size="18" />最近项目<ArrowUpRight :size="14" class="nav-end"
        /></RouterLink>
        <RouterLink
          to="/defense"
          class="nav-item nav-prepare"
          :class="{ active: route.path.startsWith('/defense') }"
          ><Route :size="18" />答辩准备<ArrowUpRight :size="14" class="nav-end"
        /></RouterLink>
        <RouterLink to="/#judges" class="nav-item nav-shortcut"
          ><Orbit :size="18" />认识评委团<ArrowUpRight :size="14" class="nav-end"
        /></RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <RouterLink
          to="/settings"
          class="nav-item"
          :class="{ active: route.name === 'system-settings' }"
          ><Settings :size="18" />系统设置</RouterLink
        >
        <div class="version">
          <span class="status-dot online"></span>本地项目工作区<span>PHASE 09</span>
        </div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumb">
          <RouterLink to="/">工作空间</RouterLink><ChevronRight :size="13" /><span>{{
            title
          }}</span>
        </div>
        <div class="topbar-right">
          <RouterLink to="/settings" class="mobile-settings-link" aria-label="系统设置"
            ><Settings :size="18"
          /></RouterLink>
          <HealthStatus /><span class="header-divider"></span
          ><span class="local-badge"><ShieldCheck :size="14" />本地开发版</span>
        </div>
      </header>
      <main id="main-content" class="main-content" tabindex="-1">
        <RouterView />
        <footer class="page-footer">
          <span>AI DEFENSE CHAMBER <span class="footer-dot">·</span> 在质疑中，让项目更强。</span
          ><span
            >阶段 09 / 流程整合<span class="footer-dot">·</span
            ><button @click="stageDialog?.open('guide')">开发说明<ArrowUpRight :size="12" /></button
          ></span>
        </footer>
      </main>
    </div>
    <StageDialog ref="stageDialog" />
  </div>
</template>
