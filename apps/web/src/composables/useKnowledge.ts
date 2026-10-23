import { ref, watch, onScopeDispose, onMounted, getCurrentInstance, type Ref } from 'vue'
import { knowledgeScopeSchema, type KnowledgeScope, type KnowledgeLibrary, type RagRetrieval, type KnowledgeAnswer } from '@defense/shared'
import { loadKnowledgeLibrary, indexKnowledgeDocument, searchKnowledge, answerKnowledge, type KnowledgeSearchMode } from '../services/knowledge-api'

export function useKnowledge(scope: Ref<KnowledgeScope | null>) {
  const library = ref<KnowledgeLibrary | null>(null), retrieval = ref<RagRetrieval | null>(null), answer = ref<KnowledgeAnswer | null>(null)
  const query = ref(''), busy = ref(false), indexingId = ref(''), error = ref(''), notice = ref('')
  const mode = ref<KnowledgeSearchMode>('keyword'), indexingMode = ref<KnowledgeSearchMode>('keyword')
  let epoch = 0, controller: AbortController | null = null
  function reset() { epoch++; controller?.abort(); busy.value = false; indexingId.value = ''; library.value = null; retrieval.value = null; answer.value = null; error.value = ''; notice.value = '' }
  async function run(operation: 'load' | 'search' | 'answer' | 'index', id?: string, ocr?: boolean, indexMode: KnowledgeSearchMode = 'keyword') {
    if (!scope.value || busy.value) return
    if ((operation === 'search' || operation === 'answer') && (!query.value.trim() || query.value.trim().length > 600)) { error.value = '请输入 1～600 字的检索问题。'; return }
    const input = knowledgeScopeSchema.parse(scope.value), text = query.value.trim(), token = ++epoch
    controller = new AbortController(); const signal = controller.signal
    busy.value = true; error.value = ''; notice.value = ''; indexingId.value = id ?? ''; indexingMode.value = indexMode
    if (operation !== 'load') { retrieval.value = null; answer.value = null }
    try {
      if (operation === 'index') {
        const document = await indexKnowledgeDocument(input, id!, ocr, signal, indexMode)
        if (token !== epoch) return
        if (library.value) library.value.documents = library.value.documents.map(d => d.attachmentId === id ? document : d)
        notice.value = indexMode === 'keyword' ? document.note
          : document.vector?.status === 'ready' ? `已完成“${document.name}”的向量索引：${document.vector.chunkCount} 个片段。`
            : document.vector?.note || document.note || '本次没有可建立向量的文字，请先检查原文索引。'
      } else if (operation === 'load') {
        const result = await loadKnowledgeLibrary(input, signal)
        if (token === epoch) library.value = result
      } else {
        const result = operation === 'answer' ? await answerKnowledge(input, text, signal, mode.value) : await searchKnowledge(input, text, signal, mode.value)
        if (token !== epoch) return
        const record = 'retrieval' in result ? result.retrieval : result
        retrieval.value = record
        answer.value = 'retrieval' in result ? result : null
        library.value = {projectId: record.projectId, documents: record.documents, omittedDocumentCount: record.omittedDocumentCount}
      }
    } catch (failure) {
      if (token === epoch) error.value = failure instanceof Error ? failure.message : '资料处理失败，请重试。'
    } finally { if (token === epoch) { busy.value = false; indexingId.value = '' } }
  }
  watch(() => JSON.stringify(scope.value), () => { reset(); void run('load') })
  watch(mode, () => { epoch++; controller?.abort(); busy.value = false; indexingId.value = ''; retrieval.value = null; answer.value = null; error.value = ''; notice.value = '' }, {flush: 'sync'})
  if (getCurrentInstance()) onMounted(() => void run('load'))
  onScopeDispose(reset)
  return {library, retrieval, answer, query, mode, busy, indexingId, indexingMode, error, notice,
    load: () => run('load'), search: () => run('search'), ask: () => run('answer'), index: (id: string, ocr?: boolean, indexMode: KnowledgeSearchMode = 'keyword') => run('index', id, ocr, indexMode)}
}
