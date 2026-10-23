import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'
import {
  attachmentSchema,
  attachmentListSchema,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_DOCUMENT_TEXT,
  type Attachment,
} from '@defense/shared'
import { AppError } from '../middleware/app-error.js'
import { MAX_KNOWLEDGE_TEXT } from '@defense/shared'
import { extractMaterialText } from './material-text.js'
import { storedDocumentSourceSchema, sourceChecksum, fromExtracted, textSource, parseDocumentSource, type DocumentSource } from './document-source.js'

const storedSchema = z.strictObject({
  attachment: attachmentSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
export function createAttachmentService(
  directory = fileURLToPath(new URL('../../.data/attachments/', import.meta.url)),
) {
  let active = 0
  function path(id: string, suffix: string) {
    if (!z.uuid().safeParse(id).success)
      throw new AppError(400, 'VALIDATION_ERROR', '附件 ID 无效。')
    return join(directory, id + suffix)
  }
  async function read(id: string) {
    try {
      const stored = storedSchema.parse(JSON.parse(await readFile(path(id, '.json'), 'utf8')))
      if (stored.attachment.id !== id) throw new Error('id mismatch')
      const bytes = await readFile(path(id, '.bin'))
      if (hash(bytes) !== stored.sha256 || bytes.length !== stored.attachment.size)
        throw new Error('content mismatch')
      return { attachment: stored.attachment, bytes }
    } catch (error) {
      if (error instanceof AppError) throw error
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new AppError(
          404,
          'ATTACHMENT_NOT_FOUND',
          '附件不存在或已移动。请重新上传，原项目与回答仍保留。',
        )
      throw new AppError(500, 'ATTACHMENT_STORAGE_ERROR', '附件读取或校验失败，请检查后端存储。')
    }
  }
  async function validate(items: Attachment[] = []) {
    const refs = attachmentListSchema.parse(items)
    for (const ref of refs) {
      const saved = await read(ref.id)
      if (JSON.stringify(saved.attachment) !== JSON.stringify(attachmentSchema.parse(ref)))
        throw new AppError(400, 'ATTACHMENT_MISMATCH', '附件信息与后端记录不一致，请重新上传。')
    }
  }
  return {
    directory,
    read,
    validate,
    async document(id: string, options: {ocr?: boolean; rebuild?: boolean; signal?: AbortSignal} = {}) {
      const {attachment, bytes} = await read(id)
      const sha256 = hash(bytes), ocr = options.ocr ?? !!attachment.ocr
      if (!options.rebuild && ocr === !!attachment.ocr) {
        try {
          const stored = storedDocumentSourceSchema.parse(JSON.parse(await readFile(path(id, '.source.json'), 'utf8')))
          if (stored.sha256 !== sha256 || stored.checksum !== sourceChecksum(stored.source)) throw new Error('source mismatch')
          return {source: stored.source, sha256}
        } catch (failure) {
          if ((failure as NodeJS.ErrnoException).code !== 'ENOENT')
            throw new AppError(500, 'DOCUMENT_SOURCE_CORRUPT', '已保存的解析正文损坏，请重新建立索引。')
        }
      }
      return {source: await parseDocumentSource(attachment, bytes, ocr, options.signal), sha256}
    },
    async upload(input: Buffer, filename: string, options: { ocr?: boolean } = {}) {
      if (active >= 2) throw new AppError(429, 'UPLOAD_BUSY', '正在处理其他文件，请稍后重试。')
      if (!input.length || input.length > MAX_DOCUMENT_BYTES)
        throw new AppError(413, 'FILE_TOO_LARGE', '文件不能为空，文档最多 8 MiB。')
      active++
      try {
        let bytes = input,
          text = '',
          pageCount: number | null = null,
          truncated = false,
          ocr: Attachment['ocr']
        let name =
          filename
            .replace(/[\x00-\x1f<>:"/\\|?*]/g, '_')
            .trim()
            .slice(0, 180) || '附件'
        let mimeType: Attachment['mimeType']
        let document: DocumentSource | undefined
        if (input.subarray(0, 5).toString() === '%PDF-') {
          mimeType = 'application/pdf'
          name = name.replace(/\.[^.]+$/, '').slice(0, 175) + '.pdf'
          const extracted = await extractMaterialText(input, 'pdf', {...options, maxText: MAX_KNOWLEDGE_TEXT})
          ;({text, pageCount, truncated, ocr} = extracted)
          document = fromExtracted(extracted)
        } else if (/\.txt$/i.test(name)) {
          mimeType = 'text/plain'
          try {
            text = new TextDecoder('utf-8', { fatal: true })
              .decode(input)
              .replace(/\u0000/g, '')
              .trim()
          } catch {
            throw new AppError(422, 'DOCUMENT_PARSE_FAILED', 'TXT 请使用 UTF-8 编码。')
          }
          if (!text) throw new AppError(422, 'DOCUMENT_PARSE_FAILED', '文档没有可用文字。')
          document = textSource(text)
        } else {
          if (input.length > MAX_IMAGE_BYTES)
            throw new AppError(413, 'FILE_TOO_LARGE', '图片最多 4 MiB。')
          try {
            const image = sharp(input, {
              limitInputPixels: 16000000,
              animated: false,
              failOn: 'warning',
            })
            const meta = await image.metadata()
            if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1)
              throw new Error('unsupported image')
            bytes = await image
              .rotate()
              .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
              .flatten({ background: '#ffffff' })
              .jpeg({ quality: 82 })
              .timeout({ seconds: 10 })
              .toBuffer()
            name = name.replace(/\.[^.]+$/, '').slice(0, 175) + '.jpg'
            mimeType = 'image/jpeg'
          } catch {
            throw new AppError(
              422,
              'INVALID_IMAGE',
              '图片无法读取。支持静态 PNG、JPEG、WebP，最多 1600 万像素；也可上传 PDF 或 UTF-8 TXT。',
            )
          }
          if (options.ocr) {
            // Run OCR only after validating and normalizing the image. Failure
            // stays visible; users can explicitly turn OCR off for photo-only attachments.
            const extracted = await extractMaterialText(bytes, 'image', {maxText: MAX_KNOWLEDGE_TEXT})
            ;({text, truncated, ocr} = extracted)
            document = fromExtracted(extracted)
          }
        }
        const attachment = attachmentSchema.parse({
          id: randomUUID(),
          name,
          mimeType,
          size: bytes.length,
          text: text.slice(0, MAX_DOCUMENT_TEXT),
          pageCount,
          truncated: truncated || text.length > MAX_DOCUMENT_TEXT,
          ...(ocr ? { ocr } : {}),
          createdAt: new Date().toISOString(),
        })
        const binary = path(attachment.id, '.bin'),
          metadata = path(attachment.id, '.json')
        try {
          await mkdir(directory, { recursive: true })
          await writeFile(binary, bytes, { flag: 'wx', mode: 0o600 })
          await writeFile(metadata, JSON.stringify({ attachment, sha256: hash(bytes) }), {
            flag: 'wx',
            mode: 0o600,
          })
          if (document) await writeFile(path(attachment.id, '.source.json'), JSON.stringify({version: 1, sha256: hash(bytes), checksum: sourceChecksum(document), source: document}), {flag: 'wx', mode: 0o600})
          await read(attachment.id)
        } catch {
          await Promise.allSettled([unlink(binary), unlink(metadata), unlink(path(attachment.id, '.source.json'))])
          throw new AppError(
            500,
            'ATTACHMENT_SAVE_FAILED',
            '附件未能保存到后端，请检查磁盘与权限后重试。',
          )
        }
        return attachment
      } finally {
        active--
      }
    },
    async materials(items: Attachment[] = [], textBudget = 6000) {
      // Each caller selects a bounded set. Full document extraction remains in saved metadata.
      const unique = [...new Map(items.map((a) => [a.id, a])).values()].slice(0, 8)
      const documents: {
        id: string
        name: string
        text: string
        truncated: boolean
        extraction: string
      }[] = []
      const images: { name: string; url: string }[] = []
      const perDocument = Math.floor(textBudget / Math.max(1, unique.filter((a) => a.text).length))
      for (const ref of unique) {
        const { attachment, bytes } = await read(ref.id)
        if (JSON.stringify(attachment) !== JSON.stringify(attachmentSchema.parse(ref)))
          throw new AppError(400, 'ATTACHMENT_MISMATCH', '附件元信息与后端不一致。')
        if (attachment.mimeType === 'image/jpeg')
          images.push({
            name: attachment.name,
            url: 'data:image/jpeg;base64,' + bytes.toString('base64'),
          })
        if (attachment.text)
          documents.push({
            id: attachment.id,
            name: attachment.name,
            text: attachment.text.slice(0, perDocument),
            extraction: attachment.ocr
              ? 'OCR 识别文字，可能错漏，须核对原文件；不代表已验证事实'
              : '文档原文提取，仍为用户提供资料',
            truncated: attachment.truncated || attachment.text.length > perDocument,
          })
      }
      return { documents, images }
    },
  }
}
export type AttachmentService = ReturnType<typeof createAttachmentService>
export const attachmentService = createAttachmentService()
