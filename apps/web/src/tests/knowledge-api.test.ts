import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchKnowledge, answerKnowledge, loadKnowledgeLibrary, indexKnowledgeDocument } from '../services/knowledge-api'
import { knowledgeScope, retrievalFixture, knowledgeAnswerFixture, libraryFixture, knowledgeFile } from '../../../../tests/fixtures/knowledge'
afterEach(() => vi.unstubAllGlobals())
const response = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200 ? {success: true, data} : data), {status})
describe('knowledge API contract', () => {
  it('uses consistent paths/scopes and validates library, search, index and cited answers', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(libraryFixture())).mockResolvedValueOnce(response(retrievalFixture()))
      .mockResolvedValueOnce(response(retrievalFixture().documents[0])).mockResolvedValueOnce(response(knowledgeAnswerFixture()))
    vi.stubGlobal('fetch', fetcher)
    expect(await loadKnowledgeLibrary(knowledgeScope)).toEqual(libraryFixture())
    expect(await searchKnowledge(knowledgeScope, '是否付费')).toEqual(retrievalFixture())
    await indexKnowledgeDocument(knowledgeScope, knowledgeFile.id, true)
    expect(await answerKnowledge(knowledgeScope, '是否付费')).toEqual(knowledgeAnswerFixture())
    expect(fetcher.mock.calls.map(c => c[0])).toEqual(['/api/v1/knowledge/library','/api/v1/knowledge/search','/api/v1/knowledge/index','/api/v1/knowledge/answer'])
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toMatchObject({project: knowledgeScope.project, attachmentId: knowledgeFile.id, ocr: true})
  })
  it('rejects invalid results, other projects/files and fabricated answer quotes', async () => {
    const foreignProject = {...retrievalFixture(), projectId: crypto.randomUUID()}
    const foreignSource = retrievalFixture(); foreignSource.sources[0]!.attachmentId = crypto.randomUUID()
    const invalidQuote = knowledgeAnswerFixture(); invalidQuote.output.citations[0]!.quote = '不存在的原文'
    for (const data of [{}, foreignProject, foreignSource]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
      await expect(searchKnowledge(knowledgeScope, '是否付费')).rejects.toThrow()
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalidQuote)))
    await expect(answerKnowledge(knowledgeScope, '是否付费')).rejects.toThrow('校验失败')
  })
  it('keeps actual service/configuration failures visible and distinguishes network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({success: false, error: {code: 'AI_NOT_CONFIGURED', message: '请先配置模型'}}, 503)))
    await expect(answerKnowledge(knowledgeScope, '是否付费')).rejects.toThrow('请先配置模型')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(searchKnowledge(knowledgeScope, '是否付费')).rejects.toThrow('无法连接资料服务')
  })
})
