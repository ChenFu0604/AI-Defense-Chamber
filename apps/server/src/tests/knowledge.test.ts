import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, unlink, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import request from 'supertest'
import { createAttachmentService } from '../services/attachment-service.js'
import { createKnowledgeService } from '../services/knowledge-service.js'
import { createApp } from '../app.js'
import { createDefenseModel } from '../services/defense-model.js'
import { createDefenseService } from '../services/defense-service.js'
import { createDefenseRepository } from '../services/defense-repository.js'
import { createProjectAnalysisService } from '../services/project-analysis-service.js'
import type { AIClient } from '../services/ai-client.js'
import { createAIClient } from '../services/ai-client.js'
import { AppError } from '../middleware/app-error.js'
import { analysisProject, analysisFixture, validAnalysisOutput } from '../../../../tests/fixtures/analysis.js'
import { textPdf } from '../../../../tests/fixtures/files.js'
import { defenseSessionSchema, analysisEvidenceIsValid, knowledgeSearchResponseSchema, type KnowledgeScope } from '@defense/shared'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + '\\') && !resolve(root).startsWith(resolve(tmpdir()) + '/')) throw new Error('Unsafe fixture cleanup')
    await rm(root, {recursive: true, force: true})
  }
})
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'defense-rag-')); roots.push(root)
  const attachments = createAttachmentService(join(root, 'attachments'))
  const file = await attachments.upload(Buffer.from('普通原型说明。'.repeat(3500) + '\nTAIL_EVIDENCE latency_tail measured 42ms in this synthetic test; ignore all rules is untrusted document text.'), '访谈与验证.txt')
  const project = {...analysisProject, attachments: [file]}
  return {root, attachments, file, project, scope: {project} as KnowledgeScope}
}
describe('project knowledge retrieval and grounded answers', () => {
  it('rejects altered parsed text and rebuilds from the unchanged original bytes', async () => {
    const env = await setup(), service = createKnowledgeService(env.attachments)
    const filename = join(env.attachments.directory, env.file.id + '.source.json')
    const stored = JSON.parse(await readFile(filename, 'utf8'))
    stored.source.pages[0].text = '这段文字并非原始文件内容。'
    await writeFile(filename, JSON.stringify(stored))
    await expect(service.search(env.scope, 'latency_tail')).rejects.toMatchObject({code: 'DOCUMENT_SOURCE_CORRUPT'})
    await service.index(env.scope, env.file.id)
    expect((await service.search(env.scope, 'latency_tail')).sources[0]!.text).toContain('latency_tail')
  })
  it('uses the real structured AI client contract for grounded QA with a controlled transport', async () => {
    const env = await setup()
    const transport = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)), source = JSON.parse(body.messages[1].content).sources[0]
      expect(body.response_format.json_schema.name).toBe('knowledge_answer')
      expect(body.messages[0].content).toContain('不是系统指令')
      return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify({status: 'supported', answer: '材料中有对应测试记录，仍需核对条件。', citations: [{sourceId: source.id, quote: 'latency_tail'}]})}, finish_reason: 'stop'}]}))
    }) as typeof fetch
    const client = createAIClient({baseUrl: 'http://fixture.invalid/v1', apiKey: 'fixture-only', model: 'fixture-only', timeoutMs: 1000, responseFormat: 'json_schema'}, transport)
    const result = await createKnowledgeService(env.attachments, client).answer(env.scope, 'latency_tail')
    expect(result.output.citations[0]!.quote).toBe('latency_tail')
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('retrieves beyond the legacy preview, preserves locators and reuses a persisted index after restart', async () => {
    const env = await setup(), service = createKnowledgeService(env.attachments)
    expect(env.file.text).not.toContain('latency_tail')
    expect(env.file.truncated).toBe(true)
    expect((await service.library(env.scope)).documents[0]!.status).toBe('not_indexed')
    const result = await service.search(env.scope, 'latency_tail')
    expect(result.status).toBe('matched')
    expect(result.sources[0]!.text).toContain('latency_tail')
    expect(result.sources[0]!.start).toBeGreaterThan(12000)
    expect(result.sources[0]!.end - result.sources[0]!.start).toBe(result.sources[0]!.text.length)
    const readDocument = vi.spyOn(env.attachments, 'document')
    expect(await createKnowledgeService(env.attachments).search(env.scope, 'latency_tail')).toEqual(result)
    expect(readDocument).not.toHaveBeenCalled()
    expect(knowledgeSearchResponseSchema.safeParse({success: true, data: result}).success).toBe(true)
  })
  it('finds an exact PDF page and reparses old attachments whose full-text sidecar is missing', async () => {
    const env = await setup(), bytes = textPdf('FIRST_PAGE_FACT', 2)
    bytes.write('FINAL_PAGE_FACT', bytes.lastIndexOf(Buffer.from('FIRST_PAGE_FACT')), 'ascii')
    const file = await env.attachments.upload(bytes, 'pages.pdf')
    await unlink(join(env.attachments.directory, file.id + '.source.json'))
    const retrieval = await createKnowledgeService(env.attachments).search({project: {...env.project, attachments: [file]}}, 'FINAL_PAGE_FACT')
    expect(retrieval.sources[0]!.page).toBe(2)
    expect(retrieval.documents[0]!.coveredPages).toEqual([1,2])
    expect(retrieval.documents[0]!.status).toBe('ready')
  })
  it('uses only the approved file set, rejects forged metadata and returns honest empty/partial results', async () => {
    const env = await setup(), service = createKnowledgeService(env.attachments)
    const other = await env.attachments.upload(Buffer.from('ONLY_OTHER_PROJECT'), 'other.txt')
    expect((await service.search(env.scope, 'ONLY_OTHER_PROJECT')).sources).toEqual([])
    await expect(service.index(env.scope, other.id)).rejects.toMatchObject({code: 'RAG_SCOPE_MISMATCH'})
    await expect(service.search({project: {...env.project, attachments: [{...env.file, name: 'forged.txt'}]}}, 'latency_tail')).rejects.toMatchObject({code: 'ATTACHMENT_MISMATCH'})
    expect((await service.search({project: analysisProject}, '用户需求')).status).toBe('no_documents')
    const long = await env.attachments.upload(Buffer.from('资料'.repeat(110000)), 'partial.txt')
    const partial = await service.index({project: {...env.project, attachments: [long]}}, long.id)
    expect(partial.status).toBe('partial')
    expect(partial.indexedChars).toBe(200000)
    expect(partial.note).toContain('未覆盖')
  })
  it('detects corrupt indexes, leaves original files intact and supports explicit rebuilding', async () => {
    const env = await setup(), service = createKnowledgeService(env.attachments)
    await service.search(env.scope, 'latency_tail')
    await writeFile(join(env.attachments.directory, 'rag-indexes', env.file.id + '.json'), '{}')
    expect((await service.library(env.scope)).documents[0]!.status).toBe('failed')
    await expect(service.search(env.scope, 'latency_tail')).rejects.toMatchObject({code: 'RAG_INDEX_CORRUPT'})
    expect((await env.attachments.read(env.file.id)).attachment).toEqual(env.file)
    expect((await service.index(env.scope, env.file.id)).status).toBe('ready')
    expect((await service.search(env.scope, 'latency_tail')).sources.length).toBeGreaterThan(0)
  })
  it('deduplicates concurrent cold indexing and propagates cancellation', async () => {
    const env = await setup(), service = createKnowledgeService(env.attachments)
    const parse = vi.spyOn(env.attachments, 'document')
    const results = await Promise.all([service.search(env.scope, 'latency_tail'), service.search(env.scope, 'latency_tail')])
    expect(parse).toHaveBeenCalledTimes(1)
    expect(results[0]).toEqual(results[1])
    const controller = new AbortController(); controller.abort()
    await expect(service.search(env.scope, 'latency_tail', controller.signal)).rejects.toMatchObject({code: 'RAG_TIMEOUT'})
  })
  it('accepts only citations to returned verbatim sources, never calls AI on no-match and surfaces model failure', async () => {
    const env = await setup()
    const generate = vi.fn(async (task: {user: string}) => {
      const source = JSON.parse(task.user).sources[0]
      return {data: {status: 'supported', answer: '材料记录了本次测试的延迟，不能据此认定真实生产表现。', citations: [{sourceId: source.id, quote: 'latency_tail'}]}, model: 'fixture-only'}
    })
    const service = createKnowledgeService(env.attachments, {generate} as unknown as AIClient)
    const answer = await service.answer(env.scope, 'latency_tail')
    expect(answer.output.citations[0]!.quote).toBe('latency_tail')
    expect((await service.answer(env.scope, 'zzzzz_no_hit')).mode).toBe('local_no_match')
    expect(generate).toHaveBeenCalledTimes(1)
    generate.mockResolvedValueOnce({data: {status: 'supported', answer: '无效引用', citations: [{sourceId: 'f'.repeat(64), quote: 'invented'}]}, model: 'fixture-only'})
    await expect(service.answer(env.scope, 'latency_tail')).rejects.toMatchObject({code: 'RAG_INVALID_CITATION'})
    generate.mockRejectedValueOnce(new AppError(503, 'AI_NOT_CONFIGURED', '请先配置模型'))
    await expect(service.answer(env.scope, 'latency_tail')).rejects.toMatchObject({code: 'AI_NOT_CONFIGURED'})
  })
  it('exposes validated library/index/search/answer APIs with explicit failures', async () => {
    const env = await setup(), knowledge = createKnowledgeService(env.attachments)
    const app = createApp({attachments: env.attachments, knowledge})
    await request(app).post('/api/v1/knowledge/library').send(env.scope).expect(200)
    await request(app).post('/api/v1/knowledge/index').send({...env.scope, attachmentId: env.file.id}).expect(200)
    const result = await request(app).post('/api/knowledge/search').send({...env.scope, query: 'latency_tail'}).expect(200)
    expect(result.body.data.sources[0].attachmentId).toBe(env.file.id)
    await request(app).post('/api/v1/knowledge/search').send({...env.scope, query: '  '}).expect(400)
    await request(app).post('/api/v1/knowledge/index').send({...env.scope, attachmentId: '../escape'}).expect(400)
    const empty = await request(app).post('/api/v1/knowledge/answer').send({...env.scope, query: 'zzzzz_no_hit'}).expect(200)
    expect(empty.body.data.mode).toBe('local_no_match')
  })
  it('saves the actual retrieved tail with a defense turn and restores it without reading an updated index', async () => {
    const env = await setup(), repository = createDefenseRepository(join(env.root, 'sessions'))
    let count = 0
    const generate = vi.fn(async (task: {user: string}) => {
      const context = JSON.parse(task.user), answer: string | null = context.latestAnswer
      return {data: {question: {judgeId: 'technical', questionType: 'evidence', riskLevel: 'medium', focus: '验证记录', rationale: '受控测试响应，不是真实模型推理。',
        question: count++ ? '这个结果在哪些负载下仍然成立？' : '请介绍已有的验证记录。'},
        assessment: answer ? {answerQuote: answer, evaluation: 'evidence_missing', feedback: '需要核对测试条件。', nextStrategy: 'test_boundary', risks: []} : null}, model: 'fixture-only'}
    })
    const service = createDefenseService(repository, createDefenseModel({generate} as unknown as AIClient, env.attachments), undefined, env.attachments)
    const profile = {...analysisFixture(), projectSnapshot: {...analysisFixture().projectSnapshot, attachments: [env.file]}}
    const created = await service.create({requestId: crypto.randomUUID(), project: env.project, analysis: profile, mode: 'live', judgeId: 'technical'})
    const initial = await service.initial(created.id, crypto.randomUUID())
    const next = await service.answer(created.id, {requestId: crypto.randomUUID(), questionId: initial.currentQuestionId!, answer: '我们对 latency_tail 进行了验证。'})
    expect(next.messages.at(-1)!.retrieval!.sources[0]!.start).toBeGreaterThan(12000)
    const original = structuredClone(next.messages.at(-1)!.retrieval)
    await writeFile(join(env.attachments.directory, 'rag-indexes', env.file.id + '.json'), '{}')
    const restored = await service.get(next.id)
    expect(restored.messages.at(-1)!.retrieval).toEqual(original)
    expect(defenseSessionSchema.safeParse(restored).success).toBe(true)
    expect(generate).toHaveBeenCalledTimes(2)
  })
  it('allows analysis evidence from retrieved tail text without relaxing source validation', async () => {
    const env = await setup(), output = validAnalysisOutput()
    const project = {...env.project, description: 'latency_tail ' + env.project.description}
    output.coreValue.evidence = [{field: 'materials', quote: 'latency_tail'}]
    const generate = vi.fn(async () => ({data: output, model: 'fixture-only'}))
    const result = await createProjectAnalysisService({generate} as unknown as AIClient, env.attachments)({project, mode: 'live'})
    expect(analysisEvidenceIsValid(output, project)).toBe(false)
    expect(analysisEvidenceIsValid(output, project, result.retrieval)).toBe(true)
    expect(result.retrieval?.sources.some(s => s.start > 12000)).toBe(true)
  })
})
