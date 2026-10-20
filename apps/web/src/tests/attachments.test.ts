import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createRouter, createMemoryHistory } from 'vue-router'
import { validateUploadFile, uploadAttachment } from '../services/attachments-api'
import { useDefenseStore } from '../stores/defense'
import { defenseApi } from '../services/defense-api'
import { readHistory } from '../services/history-storage'
import { MemoryStorage } from './project-fixtures'
import { endedReportSession } from '../../../../tests/fixtures/report'
import AttachmentGallery from '../components/attachments/AttachmentGallery.vue'
import ProjectSnapshot from '../components/ProjectSnapshot.vue'
import ProjectForm from '../components/ProjectForm.vue'
import { attachmentListSchema, type Attachment } from '@defense/shared'
vi.mock('../services/defense-api', () => ({
  defenseApi: vi.fn(),
  DefenseApiError: class extends Error {},
}))
const file: Attachment = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '架构图.jpg',
  mimeType: 'image/jpeg',
  size: 500,
  text: '',
  pageCount: null,
  truncated: false,
  createdAt: '2026-10-20T12:00:00.000Z',
}
beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.mocked(defenseApi).mockReset()
})
afterEach(() => vi.unstubAllGlobals())
describe('attachment frontend integration', () => {
  it('compiles and renders the project form with its upload controls', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => null } }],
    })
    await router.push('/')
    const html = await renderToString(
      createSSRApp({ render: () => h(ProjectForm) })
        .use(createPinia())
        .use(router),
    )
    expect(html).toContain('上传图片 / 文档')
    expect(html).toContain('拖拽图片或文档到这里')
    expect(html).toContain(
      'accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.txt"',
    )
  })
  it('validates size/type and rejects bad upload responses without inventing success', async () => {
    expect(validateUploadFile({ name: 'file.docx', type: '', size: 200 })).toContain('PDF')
    expect(validateUploadFile({ name: 'big.png', type: '', size: 5 * 1024 * 1024 })).toContain(
      '4 MiB',
    )
    expect(validateUploadFile({ name: 'empty.pdf', type: '', size: 0 })).toContain('空')
    expect(attachmentListSchema.safeParse([file, file]).success).toBe(false)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: {} }))),
    )
    await expect(uploadAttachment(new File(['image'], 'picture.png'))).rejects.toThrow('校验失败')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'INVALID_IMAGE', message: '不是有效图片' },
          }),
          { status: 422 },
        ),
      ),
    )
    await expect(uploadAttachment(new File(['fake'], 'picture.png'))).rejects.toThrow(
      '不是有效图片',
    )
  })
  it('restores unsent attachment drafts and full historical message references', async () => {
    const session = endedReportSession()
    session.status = 'awaiting_answer'
    session.endedAt = null
    vi.mocked(defenseApi).mockResolvedValue(session)
    const store = useDefenseStore()
    await store.load(session.id)
    store.updateDraft('请结合截图看原型。')
    store.updateAttachments([file])
    setActivePinia(createPinia())
    const restored = useDefenseStore()
    await restored.load(session.id)
    expect(restored.draftAttachments).toEqual([file])
    expect(restored.draft).toContain('截图')
    const saved = structuredClone(session)
    saved.messages.find((m) => m.sender === 'user')!.attachments = [file]
    vi.mocked(defenseApi).mockResolvedValueOnce(saved)
    await restored.load(session.id)
    expect(
      readHistory().entries[0]!.session.messages.find((m) => m.sender === 'user')!.attachments,
    ).toEqual([file])
  })
  it('renders image cards, document excerpts and project fields as separate cards', async () => {
    const doc = {
      ...file,
      id: crypto.randomUUID(),
      name: 'proof.pdf',
      mimeType: 'application/pdf' as const,
      text: '可核对的提取原文',
      pageCount: 2,
    }
    const html = await renderToString(
      createSSRApp({ render: () => h(AttachmentGallery, { items: [file, doc], removable: true }) }),
    )
    expect(html).toContain('/api/v1/attachments/' + file.id + '/content')
    expect(html).toContain('alt="架构图.jpg"')
    expect(html).toContain('可核对的提取原文')
    expect(html).toContain('移除附件 架构图.jpg')
    const cards = await renderToString(
      createSSRApp({ render: () => h(ProjectSnapshot, { project: endedReportSession().project }) }),
    )
    expect(cards.match(/class="project-snapshot-card"/g)).toHaveLength(5)
  })
  it('reconstructs failed attachment operations after refresh and clears files only after confirmed success', async () => {
    const session = endedReportSession(),
      answer = session.messages.find((m) => m.sender === 'user')!
    const requestId = crypto.randomUUID()
    session.status = 'failed'
    session.endedAt = null
    session.pending = {
      type: 'answer',
      requestId,
      fingerprint: 'a'.repeat(64),
      questionId: session.currentQuestionId,
      judgeId: 'business',
      answerMessageId: answer.id,
    }
    session.error = { code: 'AI_TIMEOUT', message: '超时' }
    answer.status = 'failed'
    answer.requestId = requestId
    answer.attachments = [file]
    vi.mocked(defenseApi).mockResolvedValueOnce(session)
    const store = useDefenseStore()
    await store.load(session.id)
    expect(store.draftAttachments).toEqual([file])
    expect(store.operation).toMatchObject({
      kind: 'answer',
      body: { requestId, attachments: [file] },
    })
    const completed = structuredClone(session)
    completed.status = 'awaiting_answer'
    completed.pending = null
    completed.error = null
    completed.messages.find((m) => m.sender === 'user')!.status = 'sent'
    completed.completed.push({ requestId, fingerprint: 'a'.repeat(64) })
    vi.mocked(defenseApi).mockResolvedValueOnce(completed)
    await store.retry()
    expect(store.draftAttachments).toEqual([])
    expect(store.draft).toBe('')
    expect(vi.mocked(defenseApi).mock.calls.at(-1)![1]).toMatchObject({
      requestId,
      attachments: [file],
    })
  })
})
