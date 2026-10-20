import { Router, raw } from 'express'
import type { AttachmentService } from '../services/attachment-service.js'
import { AppError } from '../middleware/app-error.js'
export function createAttachmentsRouter(service: AttachmentService) {
  const router = Router()
  router.post('/attachments', raw({ type: () => true, limit: '8mb' }), async (req, res) => {
    let filename: string
    try {
      filename = decodeURIComponent(req.get('X-File-Name') ?? '')
    } catch {
      throw new AppError(400, 'VALIDATION_ERROR', '文件名无效。')
    }
    if (!filename || !Buffer.isBuffer(req.body))
      throw new AppError(400, 'VALIDATION_ERROR', '请选择要上传的文件。')
    const result = await service.upload(req.body, filename)
    res.set('Cache-Control', 'no-store').status(201).json({ success: true, data: result })
  })
  router.get('/attachments/:id/content', async (req, res) => {
    const { attachment, bytes } = await service.read(req.params.id!)
    res
      .set({
        'Content-Type': attachment.mimeType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      })
      .send(bytes)
  })
  return router
}
