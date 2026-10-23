import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import RagSources from '../components/knowledge/RagSources.vue'
import { retrievalFixture } from '../../../../tests/fixtures/knowledge'
describe('saved retrieval sources UI', () => {
  it('shows exact saved text, page/offset and provenance in a persistent dialog', async () => {
    const source = retrievalFixture()
    const html = await renderToString(createSSRApp(RagSources, {retrieval: source, citedIds: [source.sources[0]!.id]}))
    expect(html).toContain(source.sources[0]!.text)
    expect(html).toContain('第 2 页')
    expect(html).toContain('回答引用了此片段')
    expect(html).toContain('不代表模型逐项引用')
    expect(html).toContain('<dialog')
    expect(html).toContain(`/api/v1/attachments/${source.sources[0]!.attachmentId}/content`)
  })
  it('escapes document content and explains no-match without claiming that evidence does not exist', async () => {
    const source = retrievalFixture(); source.sources[0]!.text = '<script>alert(1)</script>'; source.sources[0]!.end = source.sources[0]!.text.length
    const html = await renderToString(createSSRApp(RagSources, {retrieval: source}))
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>')
    source.sources = []; source.status = 'no_match'
    const empty = await renderToString(createSSRApp(RagSources, {retrieval: source}))
    expect(empty).toContain('本次没有检索到相关文字')
    expect(empty).toContain('不能据此断言整份材料没有证据')
  })
  it('shows the saved semantic strategy, model and similarity interpretation', async () => {
    const source = {...retrievalFixture(), strategy: 'hybrid' as const, overviewIncluded: true, embedding: {model: 'embedding-fixture', dimensions: 3, minSimilarity: 0.35}}
    const html = await renderToString(createSSRApp(RagSources, {retrieval: source}))
    expect(html).toContain('关键词与向量混合检索'); expect(html).toContain('含文档概览补充')
    expect(html).toContain('embedding-fixture'); expect(html).toContain('3 维'); expect(html).toContain('不代表事实可信度')
  })
})
