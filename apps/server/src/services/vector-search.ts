import { mkdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { RAG_CHUNK_CHARS, type RagSource } from '@defense/shared'
import { readEmbeddingConfig, type EmbeddingConfig } from '../config/embedding.js'
import { embeddingClient, type EmbeddingClient } from './embedding-client.js'
import { AppError } from '../middleware/app-error.js'
import { keywordRetriever, ragHash } from './rag-search.js'
import { createSharedWork, waitForSharedWork, type SharedWork } from './shared-work.js'

// Exact cosine search suits the bounded, single-user project library. This is
// intentionally not a database/ANN service; reject oversized scopes explicitly.
export const MAX_VECTOR_SEARCH_CHUNKS = 1200
const MAX_INDEX_BYTES = 64 * 1024 * 1024
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const vectorSchema = z.array(z.number().finite()).min(1).max(4096)
const indexSchema = z.strictObject({
  version: z.literal(1), attachmentId: z.uuid(), identity: hashSchema, sourceHash: hashSchema,
  model: z.string().min(1).max(200), dimensions: z.number().int().min(1).max(4096),
  updatedAt: z.iso.datetime(),
  rows: z.array(z.strictObject({sourceId: hashSchema, vector: vectorSchema})).min(1).max(400),
}).superRefine((index, ctx) => {
  if (new Set(index.rows.map(r => r.sourceId)).size !== index.rows.length || index.rows.some(r =>
    r.vector.length !== index.dimensions || !r.vector.some(n => n !== 0) ||
    Math.abs(Math.hypot(...r.vector) - 1) > 0.000001))
    ctx.addIssue({code: 'custom', message: '向量索引维度、归一化或片段标识无效。'})
})
type VectorIndex = z.infer<typeof indexSchema>
const envelopeSchema = z.strictObject({record: indexSchema, checksum: hashSchema})

function normalize(vector: number[]) {
  if (!vectorSchema.safeParse(vector).success || !vector.some(n => n !== 0))
    throw new AppError(502, 'EMBEDDING_INVALID_OUTPUT', 'Embedding 返回无效向量，未保存索引。')
  // Scaling first avoids overflow for finite but very large provider values.
  const scale = Math.max(...vector.map(Math.abs))
  const scaled = vector.map(n => n / scale), norm = Math.hypot(...scaled)
  return scaled.map(n => n / norm)
}
const identity = (config: EmbeddingConfig) => ragHash(JSON.stringify({
  version: 1, baseUrl: config.baseUrl.replace(/\/+$/, ''), model: config.model, dimensions: config.dimensions,
}))
const sourceHash = (chunks: RagSource[]) => ragHash(JSON.stringify(chunks.map(c => [c.id, ragHash(c.text)])))
const matches = (index: VectorIndex, chunks: RagSource[], config: EmbeddingConfig) =>
  index.identity === identity(config) && index.sourceHash === sourceHash(chunks) &&
  index.rows.length === chunks.length && index.rows.every((r,i) => r.sourceId === chunks[i]?.id)

function selectDiverse(ranked: RagSource[]) {
  const selected: RagSource[] = []
  for (const chunk of ranked) {
    if (selected.some(s => s.attachmentId === chunk.attachmentId && s.page === chunk.page &&
      Math.min(s.end, chunk.end) - Math.max(s.start, chunk.start) > RAG_CHUNK_CHARS / 2)) continue
    selected.push(chunk)
    if (selected.length === 6) break
  }
  return selected
}
export function createVectorSearch(
  directory: string,
  client: EmbeddingClient = embeddingClient,
  configuration: () => EmbeddingConfig = readEmbeddingConfig,
) {
  const pending = new Map<string, {identity: string; sourceHash: string; job: SharedWork<VectorIndex>}>()
  function path(id: string) {
    if (!z.uuid().safeParse(id).success) throw new AppError(400, 'VALIDATION_ERROR', '资料 ID 无效。')
    return join(directory, id + '.json')
  }
  async function read(id: string): Promise<VectorIndex | null> {
    const target = path(id)
    try {
      if ((await stat(target)).size > MAX_INDEX_BYTES) throw new Error('oversize')
      const stored = envelopeSchema.parse(JSON.parse(await readFile(target, 'utf8')))
      if (stored.record.attachmentId !== id || stored.checksum !== ragHash(JSON.stringify(stored.record))) throw new Error('checksum')
      return stored.record
    } catch (failure) {
      if ((failure as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new AppError(500, 'RAG_VECTOR_CORRUPT', '向量索引损坏或版本不兼容，请重新建立向量索引；原文索引仍可用于关键词检索。')
    }
  }
  async function save(record: VectorIndex) {
    const target = path(record.attachmentId), temporary = target + '.' + randomUUID() + '.tmp'
    try {
      const parsed = indexSchema.parse(record)
      const content = JSON.stringify({record: parsed, checksum: ragHash(JSON.stringify(parsed))})
      if (Buffer.byteLength(content) > MAX_INDEX_BYTES) throw new Error('oversize')
      await mkdir(directory, {recursive: true})
      await writeFile(temporary, content, {flag: 'wx', mode: 0o600})
      await rename(temporary, target)
      const saved = await read(record.attachmentId)
      if (!saved || saved.sourceHash !== record.sourceHash || saved.identity !== record.identity) throw new Error('unconfirmed')
    } catch {
      throw new AppError(500, 'RAG_VECTOR_STORAGE_ERROR', '无法确认向量索引已保存，请检查后端磁盘与权限后重试。')
    } finally { await unlink(temporary).catch(() => {}) }
  }
  async function index(chunks: RagSource[], config: EmbeddingConfig, signal?: AbortSignal, force = false): Promise<VectorIndex | null> {
    chunks = chunks.filter(c => c.text.trim().length > 0)
    signal?.throwIfAborted()
    if (!chunks.length) return null
    const id = chunks[0]!.attachmentId, signature = identity(config), hash = sourceHash(chunks)
    if (chunks.length > 400 || chunks.some(c => c.attachmentId !== id)) throw new AppError(400, 'RAG_SCOPE_MISMATCH', '向量索引仅能处理同一份资料的片段。')
    if (pending.get(id)?.job.controller.signal.aborted) pending.delete(id)
    const existing = pending.get(id)
    if (existing) {
      if (existing.identity !== signature || existing.sourceHash !== hash)
        throw new AppError(409, 'RAG_VECTOR_BUSY', '该资料正在使用另一份配置建立向量索引，请稍后重试。')
      return waitForSharedWork(existing.job, signal)
    }
    // Register before any asynchronous read so simultaneous cold requests share work.
    const job = createSharedWork(async sharedSignal => {
      const signal = AbortSignal.any([sharedSignal, AbortSignal.timeout(150000)])
      try {
      signal?.throwIfAborted()
      if (!force) {
        const cached = await read(id)
        if (cached && matches(cached, chunks, config)) return cached
      }
      const rows: VectorIndex['rows'] = []
      let model: string | null = null, dimensions: number | null = null
      for (let offset = 0; offset < chunks.length; offset += 32) {
        signal?.throwIfAborted()
        const batch = chunks.slice(offset, offset + 32)
        const result = await client.embed(batch.map(c => c.text), config, signal)
        if (result.vectors.length !== batch.length) throw new AppError(502, 'EMBEDDING_INVALID_OUTPUT', 'Embedding 未完整返回资料片段，未保存索引。')
        if (model !== null && model !== result.model) throw new AppError(502, 'RAG_VECTOR_MISMATCH', 'Embedding 在同一批资料处理中返回不同模型，请检查服务后重试。')
        model = result.model
        for (const [i, raw] of result.vectors.entries()) {
          const vector = normalize(raw)
          if ((dimensions !== null && dimensions !== vector.length) || (config.dimensions !== null && vector.length !== config.dimensions))
            throw new AppError(502, 'RAG_VECTOR_MISMATCH', 'Embedding 返回的维度不一致，未保存向量索引。')
          dimensions = vector.length
          rows.push({sourceId: batch[i]!.id, vector})
        }
      }
      signal?.throwIfAborted()
      const record = indexSchema.parse({version: 1, attachmentId: id, identity: signature, sourceHash: hash, model, dimensions, rows, updatedAt: new Date().toISOString()})
      await save(record)
      return record
      } catch (failure) {
        if (signal.aborted) throw new AppError(sharedSignal.aborted ? 499 : 504, sharedSignal.aborted ? 'REQUEST_CANCELLED' : 'RAG_TIMEOUT',
          sharedSignal.aborted ? '向量索引任务已取消。' : '向量索引处理超时，已保存的原文和索引保留，请重试。')
        throw failure
      }
    })
    pending.set(id, {identity: signature, sourceHash: hash, job})
    const cleanup = () => { if (pending.get(id)?.job === job) pending.delete(id) }
    void job.work.then(cleanup, cleanup)
    return waitForSharedWork(job, signal)
  }
  async function status(chunks: RagSource[], config: EmbeddingConfig) {
    chunks = chunks.filter(c => c.text.trim().length > 0)
    const record = chunks[0] ? await read(chunks[0].attachmentId) : null
    return {status: record ? matches(record, chunks, config) ? 'ready' as const : 'stale' as const : 'not_indexed' as const,
      model: record?.model ?? config.model, chunkCount: record?.rows.length ?? 0, updatedAt: record?.updatedAt ?? null}
  }
  async function search(query: string, chunks: RagSource[], config: EmbeddingConfig, signal?: AbortSignal, hybrid = false) {
    chunks = chunks.filter(c => c.text.trim().length > 0)
    if (chunks.length > MAX_VECTOR_SEARCH_CHUNKS)
      throw new AppError(413, 'RAG_VECTOR_SCOPE_TOO_LARGE', `本地向量检索每次最多处理 ${MAX_VECTOR_SEARCH_CHUNKS} 个片段。请减少本项目材料，或改用关键词检索。`)
    const groups = new Map<string, RagSource[]>()
    for (const chunk of chunks) {
      const group = groups.get(chunk.attachmentId) ?? []
      group.push(chunk); groups.set(chunk.attachmentId, group)
    }
    const indexes: VectorIndex[] = []
    for (const group of groups.values()) {
      const saved = await index(group, config, signal)
      if (saved) indexes.push(saved)
    }
    if (!indexes.length) return {sources: [] as RagSource[], embedding: undefined}
    signal?.throwIfAborted()
    const result = await client.embed([query], config, signal)
    if (result.vectors.length !== 1) throw new AppError(502, 'EMBEDDING_INVALID_OUTPUT', 'Embedding 未返回问题向量。')
    const question = normalize(result.vectors[0]!)
    if (indexes.some(i => i.model !== result.model || i.dimensions !== question.length))
      throw new AppError(502, 'RAG_VECTOR_MISMATCH', '问题与资料向量的模型或维度不同，请重建向量索引；未混合比较不兼容的向量。')
    const sourcesById = new Map(chunks.map(c => [c.id, c]))
    const semantic = indexes.flatMap(i => i.rows.map(r => ({id: r.sourceId,
      score: r.vector.reduce((n, value, d) => n + value * question[d]!, 0)})))
      .filter(s => s.score >= config.minSimilarity)
      .sort((a,b) => b.score - a.score || a.id.localeCompare(b.id))
    let ranked = semantic.map(s => sourcesById.get(s.id)!)
    if (hybrid) {
      // Reciprocal rank fusion; cosine gates semantic candidates before fusion.
      // Scores are ranking signals, not probabilities or factual confidence.
      const keyword = keywordRetriever.search(query, chunks), scores = new Map<string, number>()
      for (const list of [keyword, ranked]) for (const [rank, source] of list.entries())
        scores.set(source.id, (scores.get(source.id) ?? 0) + 1 / (60 + rank + 1))
      ranked = [...scores].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => sourcesById.get(id)!)
    }
    signal?.throwIfAborted()
    return {sources: selectDiverse(ranked), embedding: {model: result.model, dimensions: question.length, minSimilarity: config.minSimilarity}}
  }
  return {configuration, index, status, search}
}
export type VectorSearch = ReturnType<typeof createVectorSearch>
