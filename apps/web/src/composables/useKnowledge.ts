import { ref, watch, onScopeDispose, onMounted, getCurrentInstance, type Ref } from 'vue'
import { knowledgeScopeSchema, type KnowledgeScope, type KnowledgeLibrary, type RagRetrieval, type KnowledgeAnswer } from '@defense/shared'
import { loadKnowledgeLibrary, indexKnowledgeDocument, searchKnowledge, answerKnowledge } from '../services/knowledge-api'

export function useKnowledge(scope: Ref<KnowledgeScope | null>) {
  const library = ref<KnowledgeLibrary | null>(null), retrieval = ref<RagRetrieval | null>(null), answer = ref<KnowledgeAnswer | null>(null)
  const query = ref(''), busy = ref(false), indexingId = ref(''), error = ref(''), notice = ref('')
  let epoch = 0, controller: AbortController | null = null
  function reset() { epoch++; controller?.abort(); busy.value = false; indexingId.value = ''; library.value = null; retrieval.value = null; answer.value = null; error.value = ''; notice.value = '' }
  async function run(operation: 'load' | 'search' | 'answer' | 'index', id?: string, ocr?: boolean) {
    if (!scope.value || busy.value) return
    if ((operation === 'search' || operation === 'answer') && (!query.value.trim() || query.value.trim().length > 600)) { error.value = '请输入 1～600 字的检索问题。'; return }
    const input = knowledgeScopeSchema.parse(scope.value), text = query.value.trim(), token = ++epoch
    controller = new AbortController(); const signal = controller.signal
    busy.value = true; error.value = ''; notice.value = ''; indexingId.value = id ?? ''
    if (operation !== 'load') { retrieval.value = null; answer.value = null }
    try {
      if (operation === 'index') {
        const document = await indexKnowledgeDocument(input, id!, ocr, signal)
        if (token !== epoch) return
        if (library.value) library.value.documents = library.value.documents.map(d => d.attachmentId === id ? document : d)
        notice.value = document.note
      } else if (operation === 'load') {
        const result = await loadKnowledgeLibrary(input, signal)
        if (token === epoch) library.value = result
      } else {
        const result = operation === 'answer' ? await answerKnowledge(input, text, signal) : await searchKnowledge(input, text, signal)
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
  if (getCurrentInstance()) onMounted(() => void run('load'))
  onScopeDispose(reset)
  return {library, retrieval, answer, query, busy, indexingId, error, notice,
    load: () => run('load'), search: () => run('search'), ask: () => run('answer'), index: (id: string, ocr?: boolean) => run('index', id, ocr)}
}
