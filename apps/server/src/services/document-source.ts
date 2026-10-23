import { z } from 'zod'
import { MAX_KNOWLEDGE_TEXT, type Attachment } from '@defense/shared'
import { extractMaterialText, type ExtractedMaterial } from './material-text.js'
import { AppError } from '../middleware/app-error.js'
import { createHash } from 'node:crypto'

export const documentSourceSchema = z.strictObject({
  pages: z.array(z.strictObject({page: z.number().int().min(1).max(40).nullable(), text: z.string().min(1).max(MAX_KNOWLEDGE_TEXT), extraction: z.enum(['document', 'ocr'])})).max(40),
  pageCount: z.number().int().min(1).max(40).nullable(), truncated: z.boolean(),
  unreadPages: z.array(z.number().int().min(1).max(40)).max(40),
}).refine(v => v.pages.reduce((n,p) => n+p.text.length, 0) <= MAX_KNOWLEDGE_TEXT, '资料正文超限。')
export type DocumentSource = z.infer<typeof documentSourceSchema>
export const storedDocumentSourceSchema = z.strictObject({version: z.literal(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), checksum: z.string().regex(/^[a-f0-9]{64}$/), source: documentSourceSchema})
export const sourceChecksum = (source: DocumentSource) => createHash('sha256').update(JSON.stringify(documentSourceSchema.parse(source))).digest('hex')
export function fromExtracted(material: ExtractedMaterial): DocumentSource {
  return documentSourceSchema.parse({pages: material.textPages.filter(p => p.text.length), pageCount: material.pageCount,
    truncated: material.truncated, unreadPages: material.unreadPages})
}
export function textSource(text: string): DocumentSource {
  return {pages: [{page: null, text: text.slice(0, MAX_KNOWLEDGE_TEXT), extraction: 'document'}],
    pageCount: null, truncated: text.length > MAX_KNOWLEDGE_TEXT, unreadPages: []}
}
export async function parseDocumentSource(attachment: Attachment, bytes: Buffer, ocr: boolean, signal?: AbortSignal): Promise<DocumentSource> {
  if (attachment.mimeType === 'text/plain') {
    try { return textSource(new TextDecoder('utf-8', {fatal: true}).decode(bytes).replace(/\u0000/g, '').trim()) }
    catch { throw new AppError(422, 'DOCUMENT_PARSE_FAILED', 'TXT 请使用 UTF-8 编码。') }
  }
  if (attachment.mimeType === 'image/jpeg' && !ocr) return {pages: [], pageCount: null, truncated: false, unreadPages: []}
  return fromExtracted(await extractMaterialText(bytes, attachment.mimeType === 'application/pdf' ? 'pdf' : 'image', {ocr, maxText: MAX_KNOWLEDGE_TEXT, signal}))
}
