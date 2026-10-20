<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check, Lightbulb } from 'lucide-vue-next'
import type { Project } from '@defense/shared'
import ProjectForm from '../components/ProjectForm.vue'
import StorageNotice from '../components/StorageNotice.vue'
const router = useRouter()
const navigationError = ref('')
async function onCreated(project: Project) {
  try {
    await router.push({ name: 'project-detail', params: { id: project.id } })
  } catch {
    navigationError.value = '项目已经保存，但页面跳转失败。请通过表单中的“查看已创建项目”链接继续。'
  }
}
</script>
<template>
  <RouterLink to="/" class="back-link"><ArrowLeft :size="15" />返回总览</RouterLink>
  <div class="view-heading">
    <div class="eyebrow"><span></span>START WITH A CLEAR IDEA</div>
    <h1>创建你的项目</h1>
    <p>让评委先了解项目，再把问题问到关键处。</p>
  </div>
  <StorageNotice />
  <p v-if="navigationError" class="notice notice-error" role="alert">{{ navigationError }}</p>
  <div class="create-layout">
    <ProjectForm @created="onCreated" />
    <aside class="form-guide">
      <div class="guide-label"><Lightbulb :size="17" />一份好的项目简介</div>
      <h2>不必完美，<br />先从真实开始。</h2>
      <p>清楚说明你做了什么，以及还没有做到什么。承认未知，也是有说服力的表达。</p>
      <ul>
        <li><Check :size="14" />描述具体用户与真实场景</li>
        <li><Check :size="14" />区分当前成果和未来计划</li>
        <li><Check :size="14" />标记缺失的数据与证据</li>
      </ul>
      <div class="guide-divider"></div>
      <span class="section-kicker">WHAT HAPPENS NEXT</span>
      <ol>
        <li>填写并保存项目资料</li>
        <li>在详情页检查你的项目</li>
        <li>进入答辩准备，梳理评委视角</li>
      </ol>
      <span class="planned-tag">配置模型后，可进行多轮追问与评分</span>
    </aside>
  </div>
</template>
