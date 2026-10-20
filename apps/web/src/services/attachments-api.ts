import {
  attachmentResponseSchema,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  apiErrorResponseSchema,
  type Attachment,
} from '@defense/shared'

export function validateUploadFile(file: Pick<File, 'name' | 'type' | 'size'>): string {
  const document = /\.(pdf|txt)$/i.test(file.name)
  if (!document && !/\.(png|jpe?g|webp)$/i.test(file.name))
    return '支持 PNG、JPEG、WebP 图片、PDF 和 UTF-8 TXT。'
  if (!file.size) return '不能上传空文件。'
  if (file.size > (document ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES))
    return document ? '文档不能超过 8 MiB。' : '图片不能超过 4 MiB。'
  return ''
}
export async function uploadAttachment(file: File, signal?: AbortSignal): Promise<Attachment> {
  const error = validateUploadFile(file)
  if (error) throw new Error(error)
  const response = await fetch('/api/v1/attachments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
    signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]),
  })
  let raw: unknown
  try {
    raw = await response.json()
  } catch {
    throw new Error('上传接口返回异常，请确认后端已经更新并重启。')
  }
  if (!response.ok) {
    const failure = apiErrorResponseSchema.safeParse(raw)
    throw new Error(failure.success ? failure.data.error.message : '附件上传失败，请重试。')
  }
  const result = attachmentResponseSchema.safeParse(raw)
  if (!result.success) throw new Error('附件信息校验失败，未添加到表单。')
  return result.data.data
}
