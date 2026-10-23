<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
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
  <div class="project-create-page">
  <RouterLink to="/projects" class="back-link focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"><ArrowLeft :size="15" />返回我的项目</RouterLink>
  <div class="view-heading project-create-heading">

    <h1>创建你的项目</h1>
    <p>先把想法写下来。资料可以分次整理，填写过程中会自动保存草稿。</p>
  </div>
  <StorageNotice />
  <StatusNotice v-if="navigationError" tone="error" compact>{{ navigationError }}</StatusNotice>
  <div class="create-layout project-create-layout">
    <ProjectForm @created="onCreated" />
    <aside class="form-guide">
      <nav class="project-form-navigation aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out" aria-label="项目填写导航">
      <AeroDecor />
        <strong>从这里开始</strong>
        <a class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" href="#project-form-basics"><span>01</span><div>写下基本想法<small>项目名称、简介与目标用户</small></div></a>
        <a class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" href="#project-form-materials"><span>02</span><div>补充已有材料<small>图片、文档与文字识别 · 选填</small></div></a>
        <a class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" href="#project-form-save"><span>03</span><div>保存并进入下一步<small>保存时会检查需要补充的资料</small></div></a>
      </nav>
      <details class="project-writing-guide aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out"><summary class="focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">填写建议与保存后的下一步</summary>
      <AeroDecor />
      <div class="guide-label"><Lightbulb :size="17" />一份好的项目简介</div>
      <h2>不必完美，<br />先从真实开始。</h2>
      <p>清楚说明你做了什么，以及还没有做到什么。承认未知，也是有说服力的表达。</p>
      <ul>
        <li><Check :size="14" />描述具体用户与真实场景</li>
        <li><Check :size="14" />区分当前成果和未来计划</li>
        <li><Check :size="14" />标记缺失的数据与证据</li>
      </ul>
      <div class="guide-divider"></div>

      <p>保存后的下一步</p>
      <ol>
        <li>填写并保存项目资料</li>
        <li>在详情页检查你的项目</li>
        <li>进入答辩准备，梳理评委视角</li>
      </ol>
      <span class="planned-tag">配置模型后，可进行多轮追问与评分</span>
      </details>
    </aside>
  </div>
  </div>
</template>
