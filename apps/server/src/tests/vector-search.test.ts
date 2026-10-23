import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import request from 'supertest'
import { knowledgeSearchResponseSchema, type KnowledgeScope, type RagSource } from '@defense/shared'
import { createApp } from '../app.js'
import { AppError } from '../middleware/app-error.js'
import type { AIClient } from '../services/ai-client.js'
import type { EmbeddingConfig } from '../config/embedding.js'
import type { EmbeddingClient } from '../services/embedding-client.js'
import { createAttachmentService } from '../services/attachment-service.js'
import { createKnowledgeService } from '../services/knowledge-service.js'
import { createVectorSearch, MAX_VECTOR_SEARCH_CHUNKS } from '../services/vector-search.js'
import { keywordRetriever, ragHash } from '../services/rag-search.js'
import { analysisProject } from '../../../../tests/fixtures/analysis.js'

// These vectors deliberately encode the test's expected meanings. They exercise
// retrieval mechanics and never represent a measured provider quality result.
const material = '新生可免费试用，随后每月付费三十元。'
const synonymQuery = '学生购买意愿'
const config: EmbeddingConfig = {enabled: true, baseUrl: 'https://embedding.fixture.invalid/v1',
  model: 'fixture-embedding', apiKey: 'fixture-only-not-a-secret', timeoutMs: 1000,
  dimensions: 2, minSimilarity: 0.7}
const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + '\\') && !resolve(root).startsWith(resolve(tmpdir()) + '/'))
      throw new Error('Unsafe fixture cleanup')
    await rm(root, {recursive: true, force: true})
  }
})
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'defense-vector-')); roots.push(root)
  return root
}
function controlledClient() {
  const embed = vi.fn(async (input: string[], current: EmbeddingConfig) => ({
    vectors: input.map(text => {
      const related = text === synonymQuery || text === 'APPLE_EXACT' || text.includes('每月付费')
      const vector = related ? [4, 0] : [0, 3]
      return current.dimensions === 3 ? [...vector, 0] : vector
    }), model: current.model,
  }))
  return {embed}
}
function chunk(text: string, index = 0, attachmentId = '55555555-5555-4555-8555-555555555555'): RagSource {
  return {id: ragHash(attachmentId + ':' + index + ':' + text), attachmentId, documentName: '受控测试.txt',
    contentHash: ragHash(text), page: null, start: index * 1000, end: index * 1000 + text.length,
    text, extraction: 'document'}
}
async function fixture() {
  const root = await directory(), attachments = createAttachmentService(join(root, 'attachments'))
  const file = await attachments.upload(Buffer.from(material), '订阅访谈.txt')
  const scope: KnowledgeScope = {project: {...analysisProject, attachments: [file]}}
  const client = controlledClient(), vectors = createVectorSearch(join(root, 'vectors'), client, () => config)
  const generate = vi.fn(async (task: {user: string}) => {
    const source = JSON.parse(task.user).sources[0] as RagSource
    return {data: {status: 'supported', answer: '资料中描述了订阅方案，购买意愿仍需验证。',
      citations: [{sourceId: source.id, quote: '每月付费三十元'}]}, model: 'fixture-chat'}
  })
  const knowledge = createKnowledgeService(attachments, {generate} as unknown as AIClient, keywordRetriever,
    join(root, 'text-index'), vectors)
  return {root, attachments, file, scope, client, vectors, generate, knowledge}
}

describe('bounded vector retrieval with controlled embedding fixtures', () => {
  it('recalls a Chinese synonym with no lexical hit and preserves original text and locators', async () => {
    const env = await fixture()
    const lexical = await env.knowledge.search(env.scope, synonymQuery, undefined, false, 'keyword')
    expect(lexical.status).toBe('no_match')
    expect(env.client.embed).not.toHaveBeenCalled()
    const result = await env.knowledge.search(env.scope, synonymQuery, undefined, false, 'semantic')
    expect(result.strategy).toBe('semantic')
    expect(result.embedding).toEqual({model: config.model, dimensions: 2, minSimilarity: 0.7})
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]).toMatchObject({attachmentId: env.file.id, text: material, start: 0, end: material.length, page: null})
    expect(result.sources[0]!.text).toBe(material.slice(result.sources[0]!.start, result.sources[0]!.end))
    expect(knowledgeSearchResponseSchema.safeParse({success: true, data: result}).success).toBe(true)
    expect((await env.knowledge.library(env.scope)).documents[0]!.vector?.status).toBe('ready')
  })

  it('applies the cosine threshold and avoids calling the answer model when nothing matches', async () => {
    const env = await fixture()
    const result = await env.knowledge.answer(env.scope, '机械维修周期', undefined, 'semantic')
    expect(result.mode).toBe('local_no_match')
    expect(result.retrieval.status).toBe('no_match')
    expect(result.retrieval.sources).toEqual([])
    expect(env.generate).not.toHaveBeenCalled()
    expect(env.client.embed).toHaveBeenCalledTimes(2)
  })

  it('can semantically retrieve original text beyond the saved frontend preview', async () => {
    const env = await fixture()
    const tail = 'TAIL_EVIDENCE：受控并发试验中，接口响应为四十二毫秒。'
    const original = '普通概念说明。'.repeat(2200) + tail
    const file = await env.attachments.upload(Buffer.from(original), '完整试验记录.txt')
    expect(file.text).not.toContain('TAIL_EVIDENCE')
    const client: EmbeddingClient = {embed: vi.fn(async (input: string[]) => ({vectors: input.map(text =>
      text.includes('TAIL_EVIDENCE') || text === '系统延迟记录' ? [1, 0] : [0, 1]), model: config.model}))}
    const vectors = createVectorSearch(join(env.root, 'long-vectors'), client, () => config)
    const knowledge = createKnowledgeService(env.attachments, undefined, keywordRetriever, join(env.root, 'long-text'), vectors)
    const result = await knowledge.search({project: {...env.scope.project, attachments: [file]}}, '系统延迟记录', undefined, false, 'semantic')
    const source = result.sources.find(s => s.text.includes('TAIL_EVIDENCE'))!
    expect(source.start).toBeGreaterThan(12000)
    expect(source.text).toBe(original.slice(source.start, source.end))
    expect(source.attachmentId).toBe(file.id)
  })

  it('uses the retrieved original passage as the only permitted answer citation', async () => {
    const env = await fixture()
    const result = await env.knowledge.answer(env.scope, synonymQuery, undefined, 'semantic')
    expect(result.mode).toBe('live')
    expect(result.output.citations).toEqual([{sourceId: result.retrieval.sources[0]!.id, quote: '每月付费三十元'}])
    expect(env.generate).toHaveBeenCalledTimes(1)
    expect(JSON.parse(env.generate.mock.calls[0]![0].user).sources).toEqual(result.retrieval.sources)
  })

  it('keeps keyword evidence in hybrid mode even when its semantic similarity is below threshold', async () => {
    const env = await fixture()
    const exact = await env.attachments.upload(Buffer.from('APPLE_EXACT 属于接口协议标记。'), '协议.txt')
    const scope = {project: {...env.scope.project, attachments: [env.file, exact]}}
    const semantic = await env.knowledge.search(scope, 'APPLE_EXACT', undefined, false, 'semantic')
    expect(semantic.sources.map(s => s.attachmentId)).toEqual([env.file.id])
    const hybrid = await env.knowledge.search(scope, 'APPLE_EXACT', undefined, false, 'hybrid')
    expect(hybrid.strategy).toBe('hybrid')
    expect(hybrid.sources.map(s => s.attachmentId).sort()).toEqual([env.file.id, exact.id].sort())
    expect(new Set(hybrid.sources.map(s => s.id)).size).toBe(2)
  })

  it('never searches another project file merely because its vector has already been persisted', async () => {
    const env = await fixture()
    const other = await env.attachments.upload(Buffer.from('每月付费九十九元，第二项目专属。'), '另一项目.txt')
    const otherScope = {project: {...env.scope.project, id: '66666666-6666-4666-8666-666666666666', attachments: [other]}}
    expect((await env.knowledge.search(otherScope, synonymQuery, undefined, false, 'semantic')).sources[0]!.attachmentId).toBe(other.id)
    const result = await env.knowledge.search(env.scope, synonymQuery, undefined, false, 'semantic')
    expect(result.sources.map(s => s.attachmentId)).toEqual([env.file.id])
    expect(result.projectId).toBe(env.scope.project.id)
    await expect(env.knowledge.index(env.scope, other.id, undefined, undefined, 'semantic')).rejects.toMatchObject({code: 'RAG_SCOPE_MISMATCH'})
  })

  it('reuses normalized document embeddings after restart while embedding each new query', async () => {
    const root = await directory(), client = controlledClient(), chunks = [chunk(material)]
    const vectors = createVectorSearch(root, client, () => config)
    await vectors.search(synonymQuery, chunks, config)
    const stored = JSON.parse(await readFile(join(root, chunks[0]!.attachmentId + '.json'), 'utf8'))
    expect(stored.record.rows[0].vector).toEqual([1, 0])
    expect(stored).not.toHaveProperty('apiKey')
    expect(JSON.stringify(stored)).not.toContain(config.apiKey)
    const restarted = createVectorSearch(root, client, () => config)
    await restarted.search(synonymQuery, chunks, config)
    expect(client.embed.mock.calls.map(call => call[0])).toEqual([[material], [synonymQuery], [synonymQuery]])
    expect((await restarted.status(chunks, config)).status).toBe('ready')
  })

  it.each([
    {name: 'provider', change: {baseUrl: 'https://second.fixture.invalid/v1'}},
    {name: 'model', change: {model: 'fixture-embedding-next'}},
    {name: 'dimensions', change: {dimensions: 3}},
  ])('marks $name changes stale and rebuilds before comparing vectors', async ({change}) => {
    const root = await directory(), client = controlledClient(), chunks = [chunk(material)]
    const vectors = createVectorSearch(root, client, () => config)
    await vectors.index(chunks, config)
    const next = {...config, ...change}
    expect((await vectors.status(chunks, next)).status).toBe('stale')
    const result = await vectors.search(synonymQuery, chunks, next)
    expect(result.sources).toEqual(chunks)
    expect((await vectors.status(chunks, next)).status).toBe('ready')
    expect(client.embed.mock.calls.filter(call => call[0][0] === material)).toHaveLength(2)
  })

  it('invalidates changed chunk content even if a caller retains the original source ID', async () => {
    const root = await directory(), client = controlledClient(), original = [chunk(material)]
    const vectors = createVectorSearch(root, client, () => config)
    await vectors.index(original, config)
    const text = '每月付费六十元。', changed = [{...original[0]!, text, end: text.length}]
    expect((await vectors.status(changed, config)).status).toBe('stale')
    expect((await vectors.search(synonymQuery, changed, config)).sources[0]!.text).toBe(text)
    expect(client.embed.mock.calls.filter(call => call[0][0] === text)).toHaveLength(1)
  })

  it('caps embedding batches at 32 and deduplicates concurrent cold indexing of the same document', async () => {
    const root = await directory(), client = controlledClient()
    const chunks = Array.from({length: 35}, (_, i) => chunk('每月付费片段 ' + i, i))
    const vectors = createVectorSearch(root, client, () => config)
    const results = await Promise.all([vectors.index(chunks, config), vectors.index(chunks, config)])
    expect(client.embed.mock.calls.map(call => call[0].length)).toEqual([32, 3])
    expect(results[0]).toEqual(results[1])
    expect(results[0]!.rows).toHaveLength(35)
  })

  it('skips whitespace-only chunks without sending invalid empty inputs to the provider', async () => {
    const root = await directory(), client = controlledClient(), vectors = createVectorSearch(root, client, () => config)
    const blank = chunk(' '.repeat(900)), valid = chunk(material, 1)
    expect(await vectors.index([blank], config)).toBeNull()
    expect(client.embed).not.toHaveBeenCalled()
    const result = await vectors.search(synonymQuery, [blank, valid], config)
    expect(result.sources).toEqual([valid])
    expect(client.embed.mock.calls[0]![0]).toEqual([material])
    expect((await vectors.status([blank, valid], config)).status).toBe('ready')
  })

  it.each(['dimensions', 'model'] as const)('rejects %s drift between document embedding batches', async kind => {
    const root = await directory(), chunks = Array.from({length: 33}, (_, i) => chunk('每月付费片段 ' + i, i))
    let calls = 0
    const client: EmbeddingClient = {embed: vi.fn(async (input: string[]) => {
      calls++
      return {vectors: input.map(() => calls === 2 && kind === 'dimensions' ? [1, 0, 0] : [1, 0]),
        model: calls === 2 && kind === 'model' ? 'changed-under-same-alias' : config.model}
    })}
    const vectors = createVectorSearch(root, client, () => config)
    await expect(vectors.index(chunks, {...config, dimensions: null})).rejects.toMatchObject({code: 'RAG_VECTOR_MISMATCH'})
    expect((await vectors.status(chunks, config)).status).toBe('not_indexed')
  })

  it('refuses conflicting in-flight model configurations for the same document', async () => {
    const root = await directory(), chunks = [chunk(material)]
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const embed = vi.fn(async () => { await gate; return {vectors: [[1, 0]], model: config.model} })
    const vectors = createVectorSearch(root, {embed}, () => config)
    const first = vectors.index(chunks, config)
    await expect(vectors.index(chunks, {...config, model: 'another-model'})).rejects.toMatchObject({code: 'RAG_VECTOR_BUSY'})
    release(); await first
    expect(embed).toHaveBeenCalledTimes(1)
  })

  it.each([0, 1])('lets vector indexing caller %i cancel without cancelling the other caller', async cancelled => {
    const root = await directory(), chunks = [chunk(material)]
    let release!: () => void, announceStarted!: () => void, workerSignal: AbortSignal | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { announceStarted = resolve })
    const embed = vi.fn(async (_input: string[], _config: EmbeddingConfig, signal?: AbortSignal) => {
      workerSignal = signal; announceStarted(); await gate
      signal?.throwIfAborted()
      return {vectors: [[1, 0]], model: config.model}
    })
    const vectors = createVectorSearch(root, {embed}, () => config)
    const controllers = [new AbortController(), new AbortController()]
    const first = vectors.index(chunks, config, controllers[0]!.signal)
    await started
    const second = vectors.index(chunks, config, controllers[1]!.signal)
    const jobs = [first, second], interrupted = jobs[cancelled]!.catch(error => error)
    controllers[cancelled]!.abort()
    try {
      const failure = await interrupted
      expect(failure).toBe(controllers[cancelled]!.signal.reason)
      expect(workerSignal?.aborted).toBe(false)
    } finally { release() }
    const result = await jobs[1 - cancelled]!
    expect(result!.rows).toHaveLength(1)
    expect(embed).toHaveBeenCalledTimes(1)
    expect((await vectors.status(chunks, config)).status).toBe('ready')
  })

  it.each([0, 1])('lets text indexing caller %i cancel while the shared document parse continues', async cancelled => {
    const env = await fixture()
    let release!: () => void, announceStarted!: () => void, secondValidated!: () => void
    let workerSignal: AbortSignal | undefined, reads = 0
    const gate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { announceStarted = resolve })
    const secondReady = new Promise<void>(resolve => { secondValidated = resolve })
    const originalRead = env.attachments.read.bind(env.attachments)
    vi.spyOn(env.attachments, 'read').mockImplementation(async id => {
      const result = await originalRead(id)
      if (++reads === 2) secondValidated()
      return result
    })
    const originalDocument = env.attachments.document.bind(env.attachments)
    const document = vi.spyOn(env.attachments, 'document').mockImplementation(async (id, options) => {
      workerSignal = options?.signal; announceStarted(); await gate
      options?.signal?.throwIfAborted()
      return originalDocument(id, options)
    })
    const controllers = [new AbortController(), new AbortController()]
    const first = env.knowledge.index(env.scope, env.file.id, undefined, controllers[0]!.signal, 'keyword')
    await started
    const second = env.knowledge.index(env.scope, env.file.id, undefined, controllers[1]!.signal, 'keyword')
    await secondReady
    // Let validation's promise continuations subscribe the second caller before
    // aborting; the document worker remains held by the explicit gate.
    await new Promise<void>(resolve => setImmediate(resolve))
    const jobs = [first, second], interrupted = jobs[cancelled]!.catch(error => error)
    controllers[cancelled]!.abort()
    try {
      expect(await interrupted).toMatchObject({code: 'REQUEST_CANCELLED'})
      expect(workerSignal?.aborted).toBe(false)
    } finally { release() }
    expect((await jobs[1 - cancelled]!).status).toBe('ready')
    expect(document).toHaveBeenCalledTimes(1)
    expect((await env.knowledge.library(env.scope)).documents[0]!.status).toBe('ready')
  })

  it('reports an inner text-worker timeout before the longer semantic request timeout', async () => {
    const env = await fixture(), timers = new Map<number, AbortController[]>()
    let announceStarted!: () => void
    const started = new Promise<void>(resolve => { announceStarted = resolve })
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => {
      const controller = new AbortController(), list = timers.get(milliseconds) ?? []
      list.push(controller); timers.set(milliseconds, list)
      return controller.signal
    })
    const document = vi.spyOn(env.attachments, 'document').mockImplementation((_id, options) => new Promise((_, reject) => {
      const signal = options!.signal!
      signal.addEventListener('abort', () => reject(signal.reason), {once: true})
      announceStarted()
    }))
    try {
      const result = env.knowledge.index(env.scope, env.file.id, undefined, undefined, 'semantic').catch(error => error)
      await started
      expect(timers.get(150000)).toHaveLength(1)
      expect(timers.get(105000)).toHaveLength(1)
      timers.get(105000)![0]!.abort(new DOMException('Controlled inner text timeout', 'TimeoutError'))
      expect(await result).toMatchObject({status: 504, code: 'RAG_TIMEOUT'})
      expect(timers.get(150000)![0]!.signal.aborted).toBe(false)
      expect(document).toHaveBeenCalledTimes(1)
      expect(env.client.embed).not.toHaveBeenCalled()
    } finally { timeout.mockRestore(); document.mockRestore() }
  })

  it('reports a shared vector-worker timeout to each caller before caller cancellation', async () => {
    const root = await directory(), chunks = [chunk(material)], workerTimeout = new AbortController()
    let announceStarted!: () => void
    const started = new Promise<void>(resolve => { announceStarted = resolve })
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => {
      expect(milliseconds).toBe(150000)
      return workerTimeout.signal
    })
    const embed = vi.fn((_input: string[], _config: EmbeddingConfig, signal?: AbortSignal) =>
      new Promise<{vectors: number[][]; model: string}>((_, reject) => {
        signal!.addEventListener('abort', () => reject(signal!.reason), {once: true})
        announceStarted()
      }))
    try {
      const vectors = createVectorSearch(root, {embed}, () => config)
      const first = vectors.index(chunks, config).catch(error => error)
      await started
      const secondCaller = new AbortController()
      const second = vectors.index(chunks, config, secondCaller.signal).catch(error => error)
      workerTimeout.abort(new DOMException('Controlled shared vector timeout', 'TimeoutError'))
      expect(await first).toMatchObject({status: 504, code: 'RAG_TIMEOUT'})
      expect(await second).toMatchObject({status: 504, code: 'RAG_TIMEOUT'})
      expect(secondCaller.signal.aborted).toBe(false)
      expect(embed).toHaveBeenCalledTimes(1)
      expect((await vectors.status(chunks, config)).status).toBe('not_indexed')
    } finally { timeout.mockRestore() }
  })

  it.each([
    {name: 'zero vector', vectors: [[0, 0]], code: 'EMBEDDING_INVALID_OUTPUT'},
    {name: 'NaN', vectors: [[Number.NaN, 1]], code: 'EMBEDDING_INVALID_OUTPUT'},
    {name: 'infinite component', vectors: [[Number.POSITIVE_INFINITY, 1]], code: 'EMBEDDING_INVALID_OUTPUT'},
    {name: 'missing vector', vectors: [], code: 'EMBEDDING_INVALID_OUTPUT'},
    {name: 'configured dimension mismatch', vectors: [[1, 0, 0]], code: 'RAG_VECTOR_MISMATCH'},
  ])('rejects $name without persisting a usable index', async ({vectors: output, code}) => {
    const root = await directory(), chunks = [chunk(material)]
    const client: EmbeddingClient = {embed: vi.fn(async () => ({vectors: output, model: config.model}))}
    const vectors = createVectorSearch(root, client, () => config)
    await expect(vectors.index(chunks, config)).rejects.toMatchObject({code})
    expect((await vectors.status(chunks, config)).status).toBe('not_indexed')
  })

  it('rejects incompatible document and query vectors rather than comparing or falling back', async () => {
    const root = await directory(), chunks = [chunk(material)]
    const client: EmbeddingClient = {embed: vi.fn(async (input: string[]) => ({vectors: input.map(() => input[0] === synonymQuery ? [1, 0, 0] : [1, 0]), model: config.model}))}
    const vectors = createVectorSearch(root, client, () => config)
    await expect(vectors.search(synonymQuery, chunks, {...config, dimensions: null}, undefined, true))
      .rejects.toMatchObject({code: 'RAG_VECTOR_MISMATCH'})
  })

  it('surfaces corrupt persisted vectors and supports explicit rebuilding from original text', async () => {
    const env = await fixture()
    await env.knowledge.search(env.scope, synonymQuery, undefined, false, 'semantic')
    const filename = join(env.root, 'vectors', env.file.id + '.json')
    const saved = JSON.parse(await readFile(filename, 'utf8'))
    saved.record.rows[0].vector = [0, 1]
    await writeFile(filename, JSON.stringify(saved))
    expect((await env.knowledge.library(env.scope)).documents[0]!.vector).toMatchObject({status: 'failed', note: expect.stringContaining('损坏')})
    await expect(env.knowledge.search(env.scope, synonymQuery, undefined, false, 'semantic')).rejects.toMatchObject({code: 'RAG_VECTOR_CORRUPT'})
    expect((await env.attachments.read(env.file.id)).attachment).toEqual(env.file)
    expect((await env.knowledge.index(env.scope, env.file.id, undefined, undefined, 'semantic')).vector?.status).toBe('ready')
    expect((await env.knowledge.search(env.scope, synonymQuery, undefined, false, 'semantic')).sources[0]!.text).toBe(material)
  })

  it('keeps embedding failures visible in hybrid mode even when keyword evidence exists', async () => {
    const env = await fixture()
    env.client.embed.mockRejectedValueOnce(new AppError(429, 'EMBEDDING_RATE_LIMITED', '受控服务限流。'))
    await expect(env.knowledge.answer(env.scope, '每月付费', undefined, 'hybrid')).rejects.toMatchObject({code: 'EMBEDDING_RATE_LIMITED'})
    expect(env.generate).not.toHaveBeenCalled()
    expect((await env.knowledge.search(env.scope, '每月付费', undefined, false, 'keyword')).sources[0]!.text).toBe(material)
  })

  it('bounds oversized search scopes and propagates cancellation before contacting embeddings', async () => {
    const root = await directory(), client = controlledClient(), vectors = createVectorSearch(root, client, () => config)
    const oversized = Array.from({length: MAX_VECTOR_SEARCH_CHUNKS + 1}, (_, i) => chunk('资料 ' + i, i))
    await expect(vectors.search(synonymQuery, oversized, config)).rejects.toMatchObject({code: 'RAG_VECTOR_SCOPE_TOO_LARGE'})
    const controller = new AbortController(); controller.abort()
    await expect(vectors.index([chunk(material)], config, controller.signal)).rejects.toBeDefined()
    expect(client.embed).not.toHaveBeenCalled()
  })

  it('validates API retrieval modes and reports missing semantic configuration without disabling keywords', async () => {
    const env = await fixture()
    const unavailable = createVectorSearch(join(env.root, 'unconfigured'), env.client, () => {
      throw new AppError(503, 'EMBEDDING_NOT_CONFIGURED', '请配置 Embedding。')
    })
    const knowledge = createKnowledgeService(env.attachments, {generate: env.generate} as unknown as AIClient,
      keywordRetriever, join(env.root, 'api-text-index'), unavailable)
    const app = createApp({attachments: env.attachments, knowledge})
    for (const route of ['search', 'answer', 'index'])
      await request(app).post('/api/v1/knowledge/' + route).send({...env.scope, query: synonymQuery,
        ...(route === 'index' ? {attachmentId: env.file.id} : {}), mode: 'invented'}).expect(400)
    const missing = await request(app).post('/api/v1/knowledge/search').send({...env.scope, query: synonymQuery, mode: 'semantic'}).expect(503)
    expect(missing.body.error.code).toBe('EMBEDDING_NOT_CONFIGURED')
    const keyword = await request(app).post('/api/knowledge/search').send({...env.scope, query: '每月付费', mode: 'keyword'}).expect(200)
    expect(keyword.body.data.strategy).toBe('keyword')
    const automatic = await request(app).post('/api/v1/knowledge/search').send({...env.scope, query: '每月付费'}).expect(200)
    expect(automatic.body.data.strategy).toBe('keyword')
    expect(env.client.embed).not.toHaveBeenCalled()
  })

  it('automatically uses hybrid retrieval for model workflows when embedding is configured', async () => {
    const env = await fixture()
    expect((await env.knowledge.search(env.scope, synonymQuery)).strategy).toBe('hybrid')
    const result = await request(createApp({attachments: env.attachments, knowledge: env.knowledge}))
      .post('/api/v1/knowledge/search').send({...env.scope, query: synonymQuery, mode: 'semantic'}).expect(200)
    expect(result.body.data.strategy).toBe('semantic')
    expect(result.body.data.sources[0].attachmentId).toBe(env.file.id)
    expect(JSON.stringify(result.body)).not.toContain(config.apiKey)
  })
})
