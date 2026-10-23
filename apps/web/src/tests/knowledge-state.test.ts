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
  it('keeps query and selected mode after semantic failures and resets results when modes change', async () => {
    const {ui} = setup(); ui.query.value = '用户愿意掏钱吗'; ui.mode.value = 'semantic'
    vi.mocked(searchKnowledge).mockRejectedValueOnce(new Error('请先配置向量模型'))
    await ui.search()
    expect(ui.error.value).toBe('请先配置向量模型'); expect(ui.query.value).toBe('用户愿意掏钱吗'); expect(ui.mode.value).toBe('semantic')
    expect(vi.mocked(searchKnowledge).mock.calls[0]![3]).toBe('semantic')
    await ui.search(); expect(ui.retrieval.value).not.toBeNull()
    ui.mode.value = 'hybrid'
    expect(ui.retrieval.value).toBeNull(); expect(ui.error.value).toBe(''); expect(ui.query.value).toBe('用户愿意掏钱吗')
    await ui.ask(); expect(vi.mocked(answerKnowledge).mock.calls[0]![3]).toBe('hybrid')
  })
  it('builds vectors only on an explicit vector request and records returned state', async () => {
    const {ui} = setup(); await ui.load(); const doc = libraryFixture().documents[0]!
    await ui.index(doc.attachmentId, false)
    expect(vi.mocked(indexKnowledgeDocument).mock.calls[0]![4]).toBe('keyword')
    vi.mocked(indexKnowledgeDocument).mockResolvedValueOnce({...doc, vector: {status: 'ready', model: 'embedding-fixture', chunkCount: 2, updatedAt: '2026-10-24T01:00:00.000Z'}})
    await ui.index(doc.attachmentId, false, 'semantic')
    expect(vi.mocked(indexKnowledgeDocument).mock.calls[1]![4]).toBe('semantic')
    expect(ui.library.value?.documents[0]?.vector?.status).toBe('ready'); expect(ui.notice.value).toContain('2 个片段')
  })
  it('does not claim vector indexing success when no searchable text was extracted', async () => {
    const {ui} = setup(); await ui.load(); const doc = libraryFixture().documents[0]!
    vi.mocked(indexKnowledgeDocument).mockResolvedValueOnce({...doc, status: 'no_text', chunkCount: 0, note: '没有提取到文字，请开启 OCR。', vector: {status: 'not_indexed', model: null, chunkCount: 0, updatedAt: null}})
    await ui.index(doc.attachmentId, false, 'semantic')
    expect(ui.notice.value).toBe('没有提取到文字，请开启 OCR。'); expect(ui.notice.value).not.toContain('已完成')
  })
})
