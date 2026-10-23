<script setup lang="ts">
import { computed } from 'vue'
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
  ListChecks,
} from 'lucide-vue-next'
import BrandMark from '../components/BrandMark.vue'
import HealthStatus from '../components/HealthStatus.vue'
import { useProjectSync } from '../composables/useProjectSync'

useProjectSync()
const route = useRoute()
const isConversation = computed(() => route.name === 'defense-session')
const title = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : '总览'))
</script>
<template>
  <a href="#main-content" class="skip-link">跳到主要内容</a>
  <div class="app-shell" :class="{ 'conversation-layout': isConversation }">

    <aside class="sidebar surface-panel">

      <BrandMark />
      <div class="workspace-label">工作空间</div>
      <RouterLink
        to="/projects/new"
        class="app-button button-primary sidebar-create"
        aria-label="创建项目"
        ><Plus :size="16" /><span>创建项目</span></RouterLink
      >
      <nav class="side-nav" aria-label="主导航">
        <RouterLink to="/" class="nav-item control-button" :class="{ active: route.name === 'home' }"
          ><LayoutDashboard :size="18" />总览<span
            v-if="route.name === 'home'"
            class="nav-active-dot"
          ></span
        ></RouterLink>
        <RouterLink to="/projects" class="nav-item nav-projects control-button" aria-label="我的项目" :class="{ active: route.path.startsWith('/projects') }"
          ><FolderOpen :size="18" />我的项目<ArrowUpRight :size="14" class="nav-end"
        /></RouterLink>
        <RouterLink
          to="/defense"
          class="nav-item nav-prepare control-button"
          :class="{ active: route.path.startsWith('/defense') }"
          ><Route :size="18" />答辩准备<ArrowUpRight :size="14" class="nav-end"
        /></RouterLink>
        <RouterLink to="/#judges" class="nav-item nav-shortcut control-button"
          ><Orbit :size="18" />认识评委团<ArrowUpRight :size="14" class="nav-end"
        /></RouterLink>
        <RouterLink to="/history" class="nav-item nav-history control-button" :class="{ active: route.path.startsWith('/history') }" aria-label="历史记录与二次训练"><BookOpen :size="18" />历史记录</RouterLink>
        <RouterLink to="/tasks" class="nav-item control-button" :class="{active: route.name === 'improvement-tasks'}"><ListChecks :size="18" />改进任务</RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <RouterLink
          to="/settings"
          class="nav-item control-button"
          :class="{ active: route.name === 'system-settings' }"
          ><Settings :size="18" />系统设置</RouterLink
        >
        <div class="version">
          <span class="status-dot online"></span>本地项目工作区
        </div>
      </div>
    </aside>
    <div class="main-shell">
      <header v-if="!isConversation" class="topbar surface-panel">

        <div class="breadcrumb">
          <RouterLink to="/">工作空间</RouterLink><ChevronRight :size="13" /><span>{{
            title
          }}</span>
        </div>
        <div class="topbar-right">
          <RouterLink to="/settings" class="mobile-settings-link control-button" aria-label="系统设置"
            ><Settings :size="18"
          /></RouterLink>
          <HealthStatus /><span class="header-divider"></span
          ><span class="local-badge"><ShieldCheck :size="14" />资料保存在本机</span>
        </div>
      </header>
      <main id="main-content" class="main-content" tabindex="-1">
        <RouterView />
        <footer v-if="!isConversation" class="page-footer">
          <span>AI DEFENSE CHAMBER <span class="footer-dot">·</span> 在质疑中，让项目更强。</span
          ><RouterLink to="/settings">模型与系统设置<ArrowUpRight :size="12" /></RouterLink>
        </footer>
      </main>
    </div>
  </div>
</template>
