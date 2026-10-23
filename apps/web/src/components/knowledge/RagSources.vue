<script setup lang="ts">
import { ref, useId } from 'vue'
import { BookOpenText } from 'lucide-vue-next'
import { knowledgeStatusLabels, type RagRetrieval } from '@defense/shared'
import AppDialog from '../ui/AppDialog.vue'
const props = defineProps<{retrieval: RagRetrieval; citedIds?: string[]}>()
const open = ref(false), id = useId()
const strategyLabels = {keyword: '本地关键词检索', overview: '关键词检索与文档概览', semantic: '向量语义检索', hybrid: '关键词与向量混合检索'}
</script>
<template>
  <div class="rag-provenance">
    <button type="button" class="rag-source-trigger" :aria-expanded="open" :aria-controls="id" @click="open = true"><BookOpenText :size="15" />{{ retrieval.sources.length ? `参考资料 · ${retrieval.sources.length} 条原文` : '查看检索范围与未命中原因' }}</button>
    <AppDialog :id="id" v-model="open" title="本轮参考资料" description="显示当时保存的原文片段。提供给模型不代表模型逐项引用；材料中的说法也不代表事实已被核验。">
      <p class="rag-muted">{{ strategyLabels[retrieval.strategy] }}<template v-if="retrieval.overviewIncluded"> · 含文档概览补充</template> · {{ retrieval.query }}</p>
      <p v-if="retrieval.embedding" class="rag-muted">向量模型 {{ retrieval.embedding.model }} · {{ retrieval.embedding.dimensions }} 维 · 最低语义相似度 {{ retrieval.embedding.minSimilarity }}。相似度用于筛选相关原文，不代表事实可信度。</p>
      <p v-if="!retrieval.sources.length">本次没有检索到相关文字。可以换个关键词、核对识别范围或补充资料，不能据此断言整份材料没有证据。</p>
      <article v-for="source in retrieval.sources" :key="source.id" class="rag-source-row">
        <header><strong>{{ source.documentName }}</strong><span>{{ source.page ? `第 ${source.page} 页` : '正文' }} · 字符 {{ source.start + 1 }}–{{ source.end }}</span></header>
        <small v-if="props.citedIds?.includes(source.id)" class="positive-text">回答引用了此片段</small>
        <p>{{ source.text }}</p>
        <small>{{ source.extraction === 'ocr' ? 'OCR 识别文字，可能错漏，请核对原文件。' : '用户材料原文，未外部核验。' }}</small>
        <a :href="`/api/v1/attachments/${source.attachmentId}/content`" target="_blank" rel="noopener noreferrer" class="text-button">打开原文件 ↗</a>
      </article>
      <details class="rag-coverage"><summary>本轮资料覆盖范围</summary><ul><li v-for="doc in retrieval.documents" :key="doc.attachmentId">{{ doc.name }} · {{ knowledgeStatusLabels[doc.status] }}<span v-if="doc.skippedPages.length"> · 未覆盖页 {{ doc.skippedPages.join('、') }}</span></li></ul><p v-if="retrieval.omittedDocumentCount">还有 {{ retrieval.omittedDocumentCount }} 份资料超出本次读取上限，未参与检索。</p></details>
    </AppDialog>
  </div>
</template>
