import { z } from 'zod'

export const MAX_ATTACHMENTS = 4
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
export const MAX_DOCUMENT_TEXT = 12000
export const attachmentSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(180),
  mimeType: z.enum(['image/jpeg', 'application/pdf', 'text/plain']),
  size: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  createdAt: z.iso.datetime(),
  text: z.string().max(MAX_DOCUMENT_TEXT),
  pageCount: z.number().int().min(1).max(40).nullable(),
  truncated: z.boolean(),
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
