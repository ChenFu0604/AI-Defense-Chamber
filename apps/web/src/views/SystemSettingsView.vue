<script setup lang="ts">
import { ArrowRight, SlidersHorizontal, ShieldCheck } from 'lucide-vue-next'
import ModelConfigCard from '../components/settings/ModelConfigCard.vue'
</script>
<template>
  <div class="view-heading">

    <h1>系统设置</h1>
    <p>连接你的模型服务，为每一次答辩做好准备。</p>
  </div>
  <div class="settings-layout">
    <div class="settings-main"><ModelConfigCard /></div>
    <aside class="settings-guide surface-panel" aria-labelledby="settings-guide-title">

      <span class="guide-icon"><SlidersHorizontal :size="22" /></span>
      <h2 id="settings-guide-title">第一次连接？从这里开始</h2>
      <ol class="setup-steps">
        <li><span>01</span><div><a href="#model-base-url">填写地址与密钥</a><p>使用模型服务商提供的 API 地址和密钥。</p></div></li>
        <li><span>02</span><div><a href="#model-name">选择对话模型</a><p>获取模型列表，也可以手动填写模型名称。</p></div></li>
        <li><span>03</span><div><strong>测试连接，再保存</strong><p>测试通过后点击“保存到后端”，后续训练使用保存的配置。</p></div></li>
      </ol>
      <div class="settings-guide-note"><ShieldCheck :size="18" /><p>密钥仅保存在本机后端。图片分析需要支持视觉的模型，文字连接测试不会验证图片能力。</p></div>
      <RouterLink to="/defense" class="app-button button-secondary control-button">
      前往答辩准备<ArrowRight :size="16" /></RouterLink>
    </aside>
  </div>
</template>
