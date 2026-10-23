import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, effectScope, nextTick, type EffectScope } from 'vue'
import { useKnowledge } from '../composables/useKnowledge'
import { loadKnowledgeLibrary, searchKnowledge, answerKnowledge, indexKnowledgeDocument } from '../services/knowledge-api'
import { knowledgeScope, retrievalFixture, knowledgeAnswerFixture, libraryFixture } from '../../../../tests/fixtures/knowledge'
import type { KnowledgeScope, RagRetrieval } from '@defense/shared'
vi.mock('../services/knowledge-api', () => ({loadKnowledgeLibrary: vi.fn(), searchKnowledge: vi.fn(), answerKnowledge: vi.fn(), indexKnowledgeDocument: vi.fn()}))
const scopes: EffectScope[] = []
function setup() {
  const scope = effectScope(); scopes.push(scope)
  const project = ref<KnowledgeScope | null>(structuredClone(knowledgeScope))
  return {project, scope, ui: scope.run(() => useKnowledge(project))!}
}
beforeEach(() => {
  vi.mocked(loadKnowledgeLibrary).mockReset().mockResolvedValue(libraryFixture())
  vi.mocked(searchKnowledge).mockReset().mockResolvedValue(retrievalFixture())
  vi.mocked(answerKnowledge).mockReset().mockResolvedValue(knowledgeAnswerFixture())
  vi.mocked(indexKnowledgeDocument).mockReset().mockResolvedValue(retrievalFixture().documents[0]!)
})
afterEach(() => scopes.splice(0).forEach(s => s.stop()))
describe('knowledge interaction state', () => {
  it('loads actual coverage, blocks empty/double requests and retains a failed query for retry', async () => {
    const {ui} = setup()
    await ui.load()
    expect(ui.library.value).toEqual(libraryFixture())
    await ui.search(); expect(searchKnowledge).not.toHaveBeenCalled()
    ui.query.value = '是否付费'
    vi.mocked(searchKnowledge).mockRejectedValueOnce(new Error('后端暂时不可用'))
    await ui.search()
    expect(ui.query.value).toBe('是否付费'); expect(ui.error.value).toBe('后端暂时不可用')
    let finish!: (r: RagRetrieval) => void
    vi.mocked(searchKnowledge).mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const pending = ui.search(); await ui.search()
    expect(searchKnowledge).toHaveBeenCalledTimes(2)
    finish(retrievalFixture()); await pending
    expect(ui.retrieval.value).toEqual(retrievalFixture())
    await ui.ask(); expect(ui.answer.value).toEqual(knowledgeAnswerFixture())
  })
  it('updates index status only after success and displays indexing failures', async () => {
    const {ui} = setup(); await ui.load()
    const id = libraryFixture().documents[0]!.attachmentId
    vi.mocked(indexKnowledgeDocument).mockRejectedValueOnce(new Error('索引写入失败'))
    await ui.index(id, true)
    expect(ui.error.value).toBe('索引写入失败')
    expect(ui.notice.value).toBe('')
    await ui.index(id, true)
    expect(ui.notice.value).toBe(retrievalFixture().documents[0]!.note)
  })
  it('discards old results and aborts pending requests on project changes or disposal', async () => {
    const {ui, project, scope} = setup()
    ui.query.value = '是否付费'
    let finish!: (r: RagRetrieval) => void
    vi.mocked(searchKnowledge).mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
    const pending = ui.search()
    const signal = vi.mocked(searchKnowledge).mock.calls[0]![2]!
    const other = structuredClone(knowledgeScope); other.project.id = crypto.randomUUID()
    vi.mocked(loadKnowledgeLibrary).mockResolvedValueOnce({...libraryFixture(), projectId: other.project.id})
    project.value = other
    await nextTick(); await nextTick()
    finish(retrievalFixture()); await pending
    expect(signal.aborted).toBe(true)
    expect(ui.retrieval.value).toBeNull()
    expect(ui.library.value?.projectId).toBe(other.project.id)
    scope.stop(); expect(ui.busy.value).toBe(false)
  })
})
