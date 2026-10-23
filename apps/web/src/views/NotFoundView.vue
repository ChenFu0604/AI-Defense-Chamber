<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
</script>
<template>
  <main class="not-found aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
    <AeroDecor />
    <span>404</span>
    <h1>这里还没有舱室。</h1>
    <p>页面不存在，请返回首页继续探索。</p>
    <RouterLink to="/" class="app-button button-primary group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"><AeroDecor :orbs="false" />返回首页 →</RouterLink>
  </main>
</template>
