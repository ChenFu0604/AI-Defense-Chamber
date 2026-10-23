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
} from 'lucide-vue-next'
import BrandMark from '../components/BrandMark.vue'
import HealthStatus from '../components/HealthStatus.vue'
import AeroDecor from '../components/ui/AeroDecor.vue'
import { useProjectSync } from '../composables/useProjectSync'

useProjectSync()
const route = useRoute()
const title = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : '总览'))
</script>
<template>
  <a href="#main-content" class="skip-link focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">跳到主要内容</a>
  <div class="app-shell">
    <div class="aero-scenery" aria-hidden="true">
      <span class="aero-sunlight"></span>
      <span class="aero-cloud aero-cloud-one"></span>
      <span class="aero-cloud aero-cloud-two"></span>
      <span class="aero-hill aero-hill-far"></span>
      <span class="aero-hill aero-hill-near"></span>
      <span class="aero-bubble aero-bubble-one"></span>
      <span class="aero-bubble aero-bubble-two"></span>
    </div>
    <aside class="sidebar aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
      <BrandMark />
      <div class="workspace-label">你的答辩准备空间 <span>BETA</span></div>
      <RouterLink
        to="/projects/new"
        class="app-button button-primary sidebar-create group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
        aria-label="创建项目"
        ><AeroDecor :orbs="false" /><Plus :size="16" /><span>创建项目</span></RouterLink
      >
      <nav class="side-nav" aria-label="主导航">
        <RouterLink to="/" class="nav-item aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" :class="{ active: route.name === 'home' }"
          ><AeroDecor :orbs="false" /><LayoutDashboard :size="18" />总览<span
            v-if="route.name === 'home'"
            class="nav-active-dot"
          ></span
        ></RouterLink>
        <RouterLink to="/projects" class="nav-item nav-projects aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" aria-label="我的项目" :class="{ active: route.path.startsWith('/projects') }"
          ><AeroDecor :orbs="false" /><FolderOpen :size="18" />我的项目<ArrowUpRight :size="14" class="nav-end"
        /></RouterLink>
        <RouterLink
          to="/defense"
          class="nav-item nav-prepare aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          :class="{ active: route.path.startsWith('/defense') }"
          ><AeroDecor :orbs="false" /><Route :size="18" />答辩准备<ArrowUpRight :size="14" class="nav-end"
        /></RouterLink>
        <RouterLink to="/#judges" class="nav-item nav-shortcut aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          ><AeroDecor :orbs="false" /><Orbit :size="18" />认识评委团<ArrowUpRight :size="14" class="nav-end"
        /></RouterLink>
        <RouterLink to="/history" class="nav-item nav-history aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" :class="{ active: route.path.startsWith('/history') }" aria-label="历史记录与二次训练"><AeroDecor :orbs="false" /><BookOpen :size="18" />历史记录</RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <RouterLink
          to="/settings"
          class="nav-item aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          :class="{ active: route.name === 'system-settings' }"
          ><AeroDecor :orbs="false" /><Settings :size="18" />系统设置</RouterLink
        >
        <div class="version">
          <span class="status-dot online"></span>本地项目工作区
        </div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
        <AeroDecor :orbs="false" />
        <div class="breadcrumb">
          <RouterLink class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" to="/">工作空间</RouterLink><ChevronRight :size="13" /><span>{{
            title
          }}</span>
        </div>
        <div class="topbar-right">
          <RouterLink to="/settings" class="mobile-settings-link aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" aria-label="系统设置"
            ><AeroDecor :orbs="false" /><Settings :size="18"
          /></RouterLink>
          <HealthStatus /><span class="header-divider"></span
          ><span class="local-badge"><ShieldCheck :size="14" />资料保存在本机</span>
        </div>
      </header>
      <main id="main-content" class="main-content focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" tabindex="-1">
        <RouterView />
        <footer class="page-footer">
          <span>AI DEFENSE CHAMBER <span class="footer-dot">·</span> 在质疑中，让项目更强。</span
          ><RouterLink class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" to="/settings">模型与系统设置<ArrowUpRight :size="12" /></RouterLink>
        </footer>
      </main>
    </div>
  </div>
</template>
