import { z } from 'zod'
import { apiErrorResponseSchema, knowledgeLibraryResponseSchema, knowledgeSearchResponseSchema,
  knowledgeAnswerResponseSchema, knowledgeIndexResponseSchema, type KnowledgeScope, type RetrievalMode } from '@defense/shared'
export type KnowledgeSearchMode = RetrievalMode

async function call<T>(path: string, input: KnowledgeScope & {query?: string; attachmentId?: string; ocr?: boolean; mode?: KnowledgeSearchMode}, schema: z.ZodType<{success: true; data: T}>, signal?: AbortSignal): Promise<T> {
  try {
    const response = await fetch('/api/v1/knowledge/' + path, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(input), signal: AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])])})
    let raw: unknown
    try { raw = await response.json() } catch { throw new Error('资料服务返回格式异常，请确认后端已更新并重试。') }
    if (!response.ok) {
      const error = apiErrorResponseSchema.safeParse(raw)
      throw new Error(error.success ? error.data.error.message : '资料服务请求失败，请重试。')
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new Error('资料服务响应校验失败，未接受该结果。')
    const data = parsed.data.data
    const value = data as {projectId?: string; retrieval?: {projectId: string; sources: {attachmentId: string}[]; documents: {attachmentId: string}[]}; sources?: {attachmentId: string}[]; documents?: {attachmentId: string}[]; attachmentId?: string}
    if ((value.projectId && value.projectId !== input.project.id) || (value.retrieval && value.retrieval.projectId !== input.project.id)) throw new Error('返回的资料不属于当前项目。')
    const ids = new Set([...(input.project.attachments ?? []), ...(input.extraAttachments ?? [])].map(f => f.id))
    if ([...(value.sources ?? []), ...(value.documents ?? []), ...(value.retrieval?.sources ?? []), ...(value.retrieval?.documents ?? [])].some(s => !ids.has(s.attachmentId)) ||
      (value.attachmentId && value.attachmentId !== input.attachmentId)) throw new Error('返回的原文超出了允许使用的资料范围。')
    return data
  } catch (error) {
    if (signal?.aborted) throw new Error('本次资料请求已取消。')
    if (error instanceof TypeError) throw new Error('无法连接资料服务，请检查后端或网络后重试。')
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('资料请求超时，请检查索引状态后重试；已保存资料仍保留。')
    throw error
  }
}
export const loadKnowledgeLibrary = (scope: KnowledgeScope, signal?: AbortSignal) => call('library', scope, knowledgeLibraryResponseSchema, signal)
export const indexKnowledgeDocument = (scope: KnowledgeScope, attachmentId: string, ocr?: boolean, signal?: AbortSignal, mode?: KnowledgeSearchMode) => call('index', {...scope, attachmentId, ocr, mode}, knowledgeIndexResponseSchema, signal)
export const searchKnowledge = (scope: KnowledgeScope, query: string, signal?: AbortSignal, mode?: KnowledgeSearchMode) => call('search', {...scope, query, mode}, knowledgeSearchResponseSchema, signal)
export const answerKnowledge = (scope: KnowledgeScope, query: string, signal?: AbortSignal, mode?: KnowledgeSearchMode) => call('answer', {...scope, query, mode}, knowledgeAnswerResponseSchema, signal)
