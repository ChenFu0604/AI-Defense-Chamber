import { z } from 'zod'

export const MAX_ATTACHMENTS = 4
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
export const MAX_DOCUMENT_TEXT = 12000
export const MAX_OCR_PAGES = 3
export const OCR_TIMEOUT_MS = 90000
export const attachmentUploadOptionsSchema = z.strictObject({
  ocr: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})
export const attachmentSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(180),
  mimeType: z.enum(['image/jpeg', 'application/pdf', 'text/plain']),
  size: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  createdAt: z.iso.datetime(),
  text: z.string().max(MAX_DOCUMENT_TEXT),
  pageCount: z.number().int().min(1).max(40).nullable(),
  truncated: z.boolean(),
  // Optional so existing projects and historical snapshots remain readable.
  ocr: z
    .strictObject({
      pages: z.array(z.number().int().min(1).max(40)).min(1).max(MAX_OCR_PAGES),
      skippedPages: z.array(z.number().int().min(1).max(40)).max(40),
      confidence: z.number().min(0).max(100),
    })
    .refine(
      (value) =>
        new Set([...value.pages, ...value.skippedPages]).size ===
        value.pages.length + value.skippedPages.length,
      {
        message: 'OCR 已识别和未识别的页码不能重复。',
      },
    )
    .optional(),
})
export const attachmentListSchema = z
  .array(attachmentSchema)
  .max(MAX_ATTACHMENTS)
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
    message: '附件不能重复。',
  })
export const attachmentResponseSchema = z.strictObject({
  success: z.literal(true),
  data: attachmentSchema,
})
export type Attachment = z.infer<typeof attachmentSchema>
export const attachmentUrl = (id: string) =>
  '/api/v1/attachments/' + encodeURIComponent(id) + '/content'
