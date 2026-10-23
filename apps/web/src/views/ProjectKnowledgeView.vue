<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { knowledgeStatusLabels } from '@defense/shared'
import { useProjectsStore } from '../stores/projects'
import { useImprovementsStore } from '../stores/improvements'
import { useKnowledge } from '../composables/useKnowledge'
import AppButton from '../components/ui/AppButton.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
import RagSources from '../components/knowledge/RagSources.vue'
const route = useRoute(), projects = useProjectsStore(), tasks = useImprovementsStore()
const project = computed(() => projects.findProject(String(route.params.id)))
const allExtras = computed(() => [...new Map(tasks.tasks.filter(t => t.projectId === project.value?.id).flatMap(t => t.attachments ?? []).map(f => [f.id, f])).values()])
const extras = computed(() => allExtras.value.slice(0,32))
const omittedExtras = computed(() => Math.max(0, allExtras.value.length - extras.value.length))
const scope = computed(() => project.value ? {project: project.value, extraAttachments: extras.value} : null)
const {library, retrieval, answer, query, busy, indexingId, error, notice, load, search, ask, index} = useKnowledge(scope)
const ocrIds = ref<string[]>([])
const files = computed(() => [...new Map([...(project.value?.attachments ?? []), ...extras.value].map(f => [f.id,f])).values()])
const supportsOcr = (id: string) => files.value.find(f => f.id === id)?.mimeType !== 'text/plain'
</script>
<template>
  <div class="knowledge-page">
    <RouterLink to="/projects" class="back-link">← 返回我的项目</RouterLink>
    <template v-if="project">
      <header class="view-heading"><h1>{{ project.name }} · 项目资料库</h1><p>按问题查找项目文档和改进证据，核对原文后再完善回答。索引保存于本机后端。</p></header>
      <div class="knowledge-actions"><RouterLink :to="{name: 'project-edit', params: {id: project.id}, hash: '#project-form-materials'}" class="app-button button-primary">添加或调整项目材料</RouterLink><RouterLink :to="{name: 'improvement-tasks', query: {project: project.id}}" class="app-button button-secondary">补充任务证据</RouterLink><AppButton variant="secondary" :disabled="busy" @click="load">刷新索引状态</AppButton></div>
      <StatusNotice v-if="error" tone="error" compact>{{ error }}<template #actions><RouterLink to="/settings" class="text-button">检查模型设置 →</RouterLink></template></StatusNotice>
      <StatusNotice v-if="notice" compact>{{ notice }}</StatusNotice>
      <StatusNotice v-if="omittedExtras" tone="warning" compact>还有 {{ omittedExtras }} 份任务材料超过本页选择上限，未参与检索。本页最多选取 32 份不同的任务材料。</StatusNotice>
      <StatusNotice v-if="busy" busy compact>{{ indexingId ? '正在解析正文并建立索引，OCR 最多识别 3 个扫描页…' : '正在处理资料请求…' }}</StatusNotice>
      <section class="knowledge-search surface-panel"><h2>查找原文或询问资料</h2><form @submit.prevent="search"><label for="knowledge-query">你想从材料中了解什么？</label><textarea id="knowledge-query" v-model="query" rows="3" maxlength="600" placeholder="例如：访谈中有哪些用户不愿意付费？" :disabled="busy" /><div class="knowledge-actions"><AppButton type="submit" :disabled="busy || !query.trim()">搜索原文</AppButton><AppButton variant="secondary" :disabled="busy || !query.trim()" @click="ask">基于资料回答</AppButton></div></form><p class="rag-muted">搜索原文在本机完成，不调用模型。“基于资料回答”会将相关片段发送给已配置模型。当前为关键词检索，不具备语义向量检索能力。</p></section>
      <section v-if="retrieval" class="knowledge-results surface-panel" aria-live="polite"><h2>{{ answer ? '资料问答结果' : '原文检索结果' }}</h2><template v-if="answer"><p class="knowledge-answer">{{ answer.output.answer }}</p><p class="rag-muted">{{ answer.mode === 'live' ? `AI 资料问答 · ${answer.model} · ${answer.output.status === 'supported' ? '含可核对引用' : '资料不足以充分回答'}` : '本地检索提示 · 未调用模型' }}</p><blockquote v-for="(citation,i) in answer.output.citations" :key="i">{{ citation.quote }}<small>— {{ retrieval.sources.find(s => s.id === citation.sourceId)?.documentName }}</small></blockquote></template><p v-else>{{ retrieval.sources.length ? `找到 ${retrieval.sources.length} 条候选原文，请核对是否支持你的结论。` : '本次未找到匹配文字，请调整关键词或检查索引范围。' }}</p><RagSources :retrieval="retrieval" :cited-ids="answer?.output.citations.map(c => c.sourceId)" /></section>
      <section class="knowledge-files surface-panel"><h2>本项目可使用的材料</h2><p class="rag-muted">包括项目附件与已保存的改进任务证据。每份最多索引 20 万字、40 页；图片先检索 OCR 文字，图表内容仍需视觉模型理解。</p><div v-if="!library && !busy && !error" class="empty-state"><p>正在读取资料范围…</p></div><div v-if="library && !library.documents.length" class="empty-state"><h3>还没有可检索材料</h3><p>先添加项目书、访谈记录或任务证据，再来建立索引。</p></div><article v-for="doc in library?.documents" :key="doc.attachmentId" class="knowledge-document"><div><h3>{{ doc.name }}</h3><span class="knowledge-status" :class="doc.status">{{ knowledgeStatusLabels[doc.status] }}</span><p>{{ doc.chunkCount }} 个片段 · {{ doc.indexedChars }} 字<span v-if="doc.coveredPages.length"> · 覆盖 {{ doc.coveredPages.length }} 页</span></p><p>{{ doc.note }}</p><p v-if="doc.skippedPages.length">未覆盖页：{{ doc.skippedPages.join('、') }}</p></div><div class="knowledge-document-actions"><label v-if="supportsOcr(doc.attachmentId)"><input v-model="ocrIds" type="checkbox" :value="doc.attachmentId" :disabled="busy" />开启本地 OCR</label><AppButton variant="secondary" :disabled="busy" @click="index(doc.attachmentId, ocrIds.includes(doc.attachmentId) || !!files.find(f => f.id === doc.attachmentId)?.ocr)">{{ doc.status === 'not_indexed' ? '建立索引' : '重新建立索引' }}</AppButton></div></article><p v-if="library?.omittedDocumentCount" class="rag-muted">本次还有 {{ library.omittedDocumentCount }} 份资料超出 32 份读取上限，未参与检索。</p></section>
    </template>
    <StatusNotice v-else-if="projects.loadError" tone="error">{{ projects.loadError }}</StatusNotice>
    <div v-else-if="projects.loaded" class="empty-state surface-panel"><h1>没有找到这个项目</h1><p>请在当前浏览器恢复项目资料后重试。</p><RouterLink to="/projects" class="app-button button-primary">查看已有项目</RouterLink></div>
    <StatusNotice v-else busy compact>正在读取项目…</StatusNotice>
  </div>
</template>
