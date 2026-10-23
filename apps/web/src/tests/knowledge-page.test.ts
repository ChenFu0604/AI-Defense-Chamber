import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { renderToString } from '@vue/server-renderer'
import type { KnowledgeLibrary, KnowledgeAnswer, RagRetrieval } from '@defense/shared'
import { knowledgeScope, libraryFixture } from '../../../../tests/fixtures/knowledge'
import { useProjectsStore } from '../stores/projects'
import { useKnowledge } from '../composables/useKnowledge'
import ProjectKnowledgeView from '../views/ProjectKnowledgeView.vue'
vi.mock('../composables/useKnowledge', () => ({useKnowledge: vi.fn()}))
let library: KnowledgeLibrary
beforeEach(() => { library = libraryFixture() })
async function render() {
  const pinia = createPinia(), projects = useProjectsStore(pinia)
  projects.projects = [knowledgeScope.project]; projects.loaded = true
  const empty = {render: () => null}
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/projects/:id/knowledge', component: empty}, {path: '/projects', component: empty},
    {path: '/projects/:id/edit', name: 'project-edit', component: empty},
    {path: '/tasks', name: 'improvement-tasks', component: empty}, {path: '/settings', component: empty},
  ]})
  await router.push(`/projects/${knowledgeScope.project.id}/knowledge`)
  vi.mocked(useKnowledge).mockReturnValue({library: ref(library), retrieval: ref<RagRetrieval | null>(null), answer: ref<KnowledgeAnswer | null>(null), query: ref(''), mode: ref('keyword'), busy: ref(false), indexingId: ref(''), indexingMode: ref('keyword'), error: ref(''), notice: ref(''), load: vi.fn(), search: vi.fn(), ask: vi.fn(), index: vi.fn()})
  return renderToString(createSSRApp(ProjectKnowledgeView).use(pinia).use(router))
}
describe('knowledge library retrieval controls', () => {
  it('offers explicit keyword, semantic and hybrid modes and separate indexing actions', async () => {
    library.documents[0]!.vector = {status: 'ready', model: 'embedding-fixture', chunkCount: 2, updatedAt: null}
    const html = await render()
    expect(html).toContain('关键词 · 本机搜索'); expect(html).toContain('语义 · 按意思查找'); expect(html).toContain('混合 · 关键词与语义')
    expect(html).toContain('重建原文索引'); expect(html).toContain('重建向量索引')
    expect(html).toContain('向量已就绪'); expect(html).toContain('embedding-fixture')
    expect(html).toContain('需要向配置的服务发送资料文字')
  })
  it('displays vector failure and the exact returned reason instead of a successful state', async () => {
    library.documents[0]!.vector = {status: 'failed', model: null, chunkCount: 0, updatedAt: null, note: '向量索引校验失败，请重建。'}
    const html = await render()
    expect(html).toContain('向量索引异常'); expect(html).toContain('向量索引校验失败，请重建。'); expect(html).not.toContain('向量已就绪')
  })
})
