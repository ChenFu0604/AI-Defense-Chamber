import { createHash } from 'node:crypto'
import { RAG_CHUNK_CHARS, type RagSource } from '@defense/shared'
import type { DocumentSource } from './document-source.js'

export const ragHash = (value: string) => createHash('sha256').update(value).digest('hex')
export function chunkDocument(source: DocumentSource, attachmentId: string, documentName: string, contentHash: string): RagSource[] {
  const chunks: RagSource[] = []
  for (const page of source.pages) {
    for (let start = 0; start < page.text.length; start += RAG_CHUNK_CHARS - 150) {
      const text = page.text.slice(start, start + RAG_CHUNK_CHARS)
      chunks.push({id: ragHash(`${attachmentId}:${contentHash}:${page.page}:${page.extraction}:${start}:${text}`),
        attachmentId, documentName, contentHash, page: page.page, start, end: start+text.length, text, extraction: page.extraction})
      if (start + RAG_CHUNK_CHARS >= page.text.length) break
    }
  }
  return chunks
}
const stopwords = new Set(['的','了','是','在','和','与','一个','这个','项目','我们','你们','怎样','如何','是否','什么','哪些','可以','请问','about','what','how','the','and','for','with','this','that'])
function terms(text: string) {
  const normalized = text.normalize('NFKC').toLowerCase()
  const result: string[] = [...(normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [])]
  for (const segment of new Intl.Segmenter('zh', {granularity: 'word'}).segment(normalized)) {
    if (segment.isWordLike && /\p{Script=Han}/u.test(segment.segment) && !stopwords.has(segment.segment)) result.push(segment.segment)
  }
  return [...new Set(result.filter(t => !stopwords.has(t)))].slice(0, 80)
}
/** Local lexical ranking, also used as one input to hybrid retrieval. */
export interface TextRetriever { search(query: string, chunks: RagSource[]): RagSource[] }
export const keywordRetriever: TextRetriever = {
  search(query, chunks) {
    const tokens = terms(query)
    if (!tokens.length) return []
    const frequencies = new Map(tokens.map(t => [t, chunks.filter(c => c.text.toLowerCase().includes(t)).length]))
    const scored = chunks.map(chunk => {
      const text = chunk.text.normalize('NFKC').toLowerCase()
      const score = tokens.reduce((n, t) => {
        const count = text.split(t).length-1
        return n + (count ? Math.log(1 + chunks.length / (1 + frequencies.get(t)!)) * Math.min(count, 3) * (t.length > 1 ? 1 : .35) : 0)
      }, 0)
      return {chunk, score}
    }).filter(v => v.score > 0).sort((a,b) => b.score-a.score || a.chunk.id.localeCompare(b.chunk.id))
    const selected: RagSource[] = []
    for (const {chunk} of scored) {
      if (selected.some(s => s.attachmentId === chunk.attachmentId && s.page === chunk.page && Math.min(s.end,chunk.end)-Math.max(s.start,chunk.start) > RAG_CHUNK_CHARS / 2)) continue
      selected.push(chunk)
      if (selected.length === 6) break
    }
    return selected
  },
}
