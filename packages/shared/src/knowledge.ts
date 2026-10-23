import { z } from 'zod'
import { projectSchema } from './project.js'
import { attachmentSchema } from './attachments.js'

export const MAX_KNOWLEDGE_TEXT = 200000
export const MAX_KNOWLEDGE_FILES = 32
export const RAG_CHUNK_CHARS = 900
export const ragSourceSchema = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{64}$/), attachmentId: z.uuid(), documentName: z.string().min(1).max(180),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), page: z.number().int().min(1).max(40).nullable(),
  start: z.number().int().min(0), end: z.number().int().min(1),
  text: z.string().min(1).max(RAG_CHUNK_CHARS), extraction: z.enum(['document', 'ocr']),
}).refine(s => s.end - s.start === s.text.length, '原文位置与片段长度不一致。')
export type RagSource = z.infer<typeof ragSourceSchema>
export const retrievalModeSchema = z.enum(['keyword', 'semantic', 'hybrid'])
export type RetrievalMode = z.infer<typeof retrievalModeSchema>
export const knowledgeVectorStatusSchema = z.strictObject({
  status: z.enum(['not_indexed', 'ready', 'stale', 'not_configured', 'failed']),
  model: z.string().min(1).max(200).nullable(),
  chunkCount: z.number().int().min(0).max(400),
  updatedAt: z.iso.datetime().nullable(),
  note: z.string().max(600).optional(),
})
export const knowledgeStatusLabels = {
  not_indexed: '待建立索引', ready: '可检索', partial: '部分可检索', no_text: '没有可检索文字', failed: '处理失败',
} as const
export const knowledgeDocumentSchema = z.strictObject({
  attachmentId: z.uuid(), name: z.string().min(1).max(180), status: z.enum(['not_indexed', 'ready', 'partial', 'no_text', 'failed']),
  chunkCount: z.number().int().min(0).max(400), indexedChars: z.number().int().min(0).max(MAX_KNOWLEDGE_TEXT),
  pageCount: z.number().int().min(1).max(40).nullable(),
  coveredPages: z.array(z.number().int().min(1).max(40)).max(40),
  skippedPages: z.array(z.number().int().min(1).max(40)).max(40),
  note: z.string().max(600), updatedAt: z.iso.datetime().nullable(),
  vector: knowledgeVectorStatusSchema.optional(),
})
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>
export const ragRetrievalSchema = z.strictObject({
  version: z.literal(1), strategy: z.enum(['keyword', 'overview', 'semantic', 'hybrid']), projectId: z.uuid(),
  overviewIncluded: z.boolean().optional(),
  embedding: z.strictObject({model: z.string().min(1).max(200), dimensions: z.number().int().min(1).max(4096), minSimilarity: z.number().min(0).max(1)}).optional(),
  scopeHash: z.string().regex(/^[a-f0-9]{64}$/), query: z.string().min(1).max(600),
  status: z.enum(['matched', 'no_match', 'no_documents']),
  sources: z.array(ragSourceSchema).max(6), documents: z.array(knowledgeDocumentSchema).max(MAX_KNOWLEDGE_FILES),
  omittedDocumentCount: z.number().int().min(0),
}).superRefine((v, ctx) => {
  if (new Set(v.sources.map(s => s.id)).size !== v.sources.length ||
    v.sources.some(s => !v.documents.some(d => d.attachmentId === s.attachmentId)) ||
    (v.status === 'matched') !== (v.sources.length > 0)) ctx.addIssue({code: 'custom', message: '检索来源或状态无效。'})
  if (v.embedding && !['semantic', 'hybrid'].includes(v.strategy)) ctx.addIssue({code: 'custom', message: '向量检索信息与检索方式不一致。'})
})
export type RagRetrieval = z.infer<typeof ragRetrievalSchema>
export const knowledgeScopeSchema = z.strictObject({
  project: projectSchema,
  extraAttachments: z.array(attachmentSchema).max(MAX_KNOWLEDGE_FILES).optional(),
})
export type KnowledgeScope = z.infer<typeof knowledgeScopeSchema>
export const knowledgeSearchSchema = knowledgeScopeSchema.extend({query: z.string().trim().min(1).max(600), mode: retrievalModeSchema.optional()})
export const knowledgeIndexRequestSchema = knowledgeScopeSchema.extend({attachmentId: z.uuid(), ocr: z.boolean().optional(), mode: retrievalModeSchema.optional()})
export const knowledgeLibrarySchema = z.strictObject({projectId: z.uuid(), documents: z.array(knowledgeDocumentSchema).max(MAX_KNOWLEDGE_FILES), omittedDocumentCount: z.number().int().min(0)})
export type KnowledgeLibrary = z.infer<typeof knowledgeLibrarySchema>
export const knowledgeAnswerOutputSchema = z.strictObject({
  status: z.enum(['supported', 'insufficient']), answer: z.string().trim().min(1).max(3000),
  citations: z.array(z.strictObject({sourceId: z.string().regex(/^[a-f0-9]{64}$/), quote: z.string().trim().min(1).max(300)})).max(6),
}).refine(v => v.status !== 'supported' || v.citations.length > 0, '有依据的回答必须提供引用。')
export const knowledgeAnswerSchema = z.strictObject({
  mode: z.enum(['live', 'local_no_match']), model: z.string().min(1).max(200).nullable(),
  output: knowledgeAnswerOutputSchema, retrieval: ragRetrievalSchema,
}).superRefine((v, ctx) => {
  if ((v.mode === 'live') !== (v.model !== null) ||
    v.output.citations.some(c => !v.retrieval.sources.some(s => s.id === c.sourceId && s.text.includes(c.quote))))
    ctx.addIssue({code: 'custom', message: '回答引用或来源无效。'})
})
export type KnowledgeAnswer = z.infer<typeof knowledgeAnswerSchema>
export const knowledgeLibraryResponseSchema = z.strictObject({success: z.literal(true), data: knowledgeLibrarySchema})
export const knowledgeSearchResponseSchema = z.strictObject({success: z.literal(true), data: ragRetrievalSchema})
export const knowledgeAnswerResponseSchema = z.strictObject({success: z.literal(true), data: knowledgeAnswerSchema})
export const knowledgeIndexResponseSchema = z.strictObject({success: z.literal(true), data: knowledgeDocumentSchema})
