import type { Attachment, RagRetrieval, KnowledgeScope, KnowledgeAnswer, KnowledgeLibrary } from '@defense/shared'
import { analysisProject } from './analysis.js'
export const knowledgeFile: Attachment = {id: '55555555-5555-4555-8555-555555555555', name: '合成访谈.pdf', mimeType: 'application/pdf',
  size: 123, text: '受控测试原文：有三人表示尚未决定是否付费。', pageCount: 2, truncated: false, createdAt: '2026-10-23T10:00:00.000Z'}
export const knowledgeScope: KnowledgeScope = {project: {...analysisProject, attachments: [knowledgeFile]}}
export function retrievalFixture(): RagRetrieval {
  const text = knowledgeFile.text
  return {version: 1, strategy: 'keyword', projectId: analysisProject.id, scopeHash: 'a'.repeat(64), query: '是否付费', status: 'matched', omittedDocumentCount: 0,
    sources: [{id: 'b'.repeat(64), attachmentId: knowledgeFile.id, contentHash: 'c'.repeat(64), documentName: knowledgeFile.name, page: 2,
      start: 0, end: text.length, text, extraction: 'document'}],
    documents: [{attachmentId: knowledgeFile.id, name: knowledgeFile.name, status: 'ready', chunkCount: 2, indexedChars: 100,
      pageCount: 2, coveredPages: [1,2], skippedPages: [], note: '合成测试资料。', updatedAt: knowledgeFile.createdAt}]}
}
export const libraryFixture = (): KnowledgeLibrary => ({projectId: analysisProject.id, documents: retrievalFixture().documents, omittedDocumentCount: 0})
export const knowledgeAnswerFixture = (): KnowledgeAnswer => ({mode: 'live', model: 'fixture-only', retrieval: retrievalFixture(),
  output: {status: 'supported', answer: '材料中有三人尚未决定是否付费，这不代表所有用户的意愿。', citations: [{sourceId: 'b'.repeat(64), quote: '有三人表示尚未决定是否付费'}]}})
