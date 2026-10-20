import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { DefenseSession, DefenseOperation } from '@defense/shared'
import { useDefenseStore } from '../stores/defense'
import { defenseApi, DefenseApiError } from '../services/defense-api'
import { MemoryStorage } from './project-fixtures'
import { defenseFixture } from '../../../../tests/fixtures/defense'

vi.mock('../services/defense-api', async (original) => ({
  ...(await original<typeof import('../services/defense-api')>()),
  defenseApi: vi.fn(),
}))
const api = vi.mocked(defenseApi)
function ready(): DefenseSession {
  const session = defenseFixture('demo'),
    id = crypto.randomUUID()
  session.status = 'awaiting_answer'
  session.currentQuestionId = id
  session.messages.push({
    id,
    sender: 'judge',
    content: '【模拟】如何证明需求？',
    createdAt: session.createdAt,
    judgeId: 'business',
    status: 'sent',
    question: {
      judgeId: 'business',
      question: '【模拟】如何证明需求？',
      questionType: 'evidence',
      riskLevel: 'medium',
      focus: '市场',
      rationale: '演示',
    },
    assessment: null,
    replyTo: null,
    requestId: crypto.randomUUID(),
    model: null,
  })
  return session
}
function failed(session: DefenseSession, operation: DefenseOperation): DefenseSession {
  if (operation.kind !== 'answer') throw new Error('answer required')
  const record = structuredClone(session),
    id = crypto.randomUUID()
  record.status = 'failed'
  record.error = { code: 'AI_TIMEOUT', message: '超时' }
  record.pending = {
    type: 'answer',
    requestId: operation.body.requestId,
    fingerprint: 'x'.repeat(64),
    questionId: operation.body.questionId,
    judgeId: 'business',
    answerMessageId: id,
  }
  record.messages.push({
    id,
    sender: 'user',
    content: operation.body.answer,
    createdAt: record.updatedAt,
    judgeId: 'business',
    status: 'failed',
    question: null,
    assessment: null,
    replyTo: record.currentQuestionId,
    requestId: operation.body.requestId,
    model: null,
  })
  return record
}
let storage: MemoryStorage
beforeEach(() => {
  setActivePinia(createPinia())
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  api.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('defense session frontend lifecycle', () => {
  it('ignores a creation response after leaving the preparation page and preserves its retry ID', async () => {
    const store = useDefenseStore(),
      base = defenseFixture('demo')
    let complete!: (session: DefenseSession) => void
    api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = store.start({
      project: base.project,
      analysis: base.analysis,
      mode: base.mode,
      judgeId: 'business',
    })
    const requestId = (api.mock.calls[0]![1] as { requestId: string }).requestId
    store.leave()
    complete({ ...base, id: requestId })
    expect(await pending).toBeNull()
    expect(store.session).toBeNull()
    expect(storage.data.get('defense-chamber.pending-create.v1')).toContain(requestId)
    store.error = '上一页失败'
    store.prepare()
    expect(store.error).toBe('')
  })
  it('does not overwrite an unreadable local draft when loading server records', async () => {
    const session = ready(),
      key = 'defense-chamber.draft.v1.' + session.id
    storage.data.set(key, '{corrupt')
    api.mockResolvedValueOnce(session)
    const store = useDefenseStore()
    await store.load(session.id)
    expect(storage.data.get(key)).toBe('{corrupt')
    expect(store.warning).toBeTruthy()
    store.updateDraft('新的明确输入')
    expect(JSON.parse(storage.data.get(key)!).answer).toBe('新的明确输入')
  })
  it('blocks double create while pending and retains the creation ID for retry', async () => {
    const store = useDefenseStore(),
      base = defenseFixture('demo')
    const input = {
      project: base.project,
      analysis: base.analysis,
      mode: base.mode,
      judgeId: base.currentJudgeId,
    }
    let reject!: (error: Error) => void
    api.mockImplementationOnce(
      () =>
        new Promise((_done, fail) => {
          reject = fail
        }),
    )
    const pending = store.start(input)
    expect(await store.start(input)).toBeNull()
    expect(api).toHaveBeenCalledTimes(1)
    reject(new Error('网络失败'))
    await pending
    const requestId = (api.mock.calls[0]![1] as { requestId: string }).requestId
    api.mockResolvedValueOnce({ ...base, id: requestId })
    expect((await store.start(input))?.id).toBe(requestId)
    expect((api.mock.calls[1]![1] as { requestId: string }).requestId).toBe(requestId)
  })
  it('rejects blank answers and persists unsent drafts for refresh', async () => {
    const store = useDefenseStore(),
      session = ready()
    api.mockResolvedValue(session)
    await store.load(session.id)
    store.updateDraft('   ')
    await store.answer()
    expect(api).toHaveBeenCalledTimes(1)
    store.updateDraft('尚未取得证据，计划访谈用户。')
    setActivePinia(createPinia())
    const restored = useDefenseStore()
    await restored.load(session.id)
    expect(restored.draft).toBe('尚未取得证据，计划访谈用户。')
  })
  it('preserves submitted answer after failure and retries the exact request without duplicate sends', async () => {
    const session = ready(),
      store = useDefenseStore()
    api.mockResolvedValueOnce(session)
    await store.load(session.id)
    store.updateDraft('访谈二十名学生')
    let saved!: DefenseSession
    api
      .mockImplementationOnce(async (_path, body) => {
        saved = failed(session, { kind: 'answer', body } as DefenseOperation)
        throw new DefenseApiError('AI_TIMEOUT', '超时')
      })
      .mockImplementationOnce(async () => saved)
    await store.answer()
    expect(store.draft).toBe('访谈二十名学生')
    expect(store.session?.status).toBe('failed')
    const requestId = store.operation!.body.requestId
    const success = structuredClone(saved)
    success.status = 'awaiting_answer'
    success.pending = null
    success.error = null
    success.messages.at(-1)!.status = 'sent'
    success.completed.push({ requestId, fingerprint: 'x'.repeat(64) })
    let resolve!: (record: DefenseSession) => void
    api.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = store.retry()
    await store.retry()
    expect(api).toHaveBeenCalledTimes(4)
    resolve(success)
    await pending
    expect(store.draft).toBe('')
    expect(store.operation).toBeNull()
    expect(store.error).toBe('')
    expect((api.mock.calls[3]![1] as { requestId: string }).requestId).toBe(requestId)
  })
  it('reconstructs pending answer from the server after refresh without localStorage', async () => {
    const session = ready(),
      pending = failed(session, {
        kind: 'answer',
        body: {
          requestId: crypto.randomUUID(),
          questionId: session.currentQuestionId!,
          answer: '回答已保存到服务端',
        },
      })
    storage.denyReads = true
    api.mockResolvedValueOnce(pending)
    const store = useDefenseStore()
    await store.load(session.id)
    expect(store.draft).toBe('回答已保存到服务端')
    expect(store.operation?.kind).toBe('answer')
    expect(store.error).toBe('超时')
    expect(store.warning).toBeTruthy()
  })
  it('recovers a lost successful response by checking the completed request', async () => {
    const session = ready(),
      store = useDefenseStore()
    api.mockResolvedValueOnce(session)
    await store.load(session.id)
    store.updateDraft('有效回答')
    let completed!: DefenseSession
    api
      .mockImplementationOnce(async (_path, body) => {
        completed = structuredClone(session)
        completed.completed.push({
          requestId: (body as { requestId: string }).requestId,
          fingerprint: 'x'.repeat(64),
        })
        throw new DefenseApiError('NETWORK_ERROR', '响应丢失')
      })
      .mockImplementationOnce(async () => completed)
    await store.answer()
    expect(store.error).toBe('')
    expect(store.draft).toBe('')
    expect(store.operation).toBeNull()
  })
  it('sends judge switch against the current question and prevents answers after end', async () => {
    const session = ready(),
      store = useDefenseStore()
    api.mockResolvedValue(session)
    await store.load(session.id)
    await store.switchJudge('technical')
    expect(api.mock.calls[1]![0]).toBe('/' + session.id + '/judge')
    expect(api.mock.calls[1]![1]).toMatchObject({
      questionId: session.currentQuestionId,
      judgeId: 'technical',
    })
    const ended = { ...session, status: 'ended' as const, endedAt: session.updatedAt }
    api.mockResolvedValueOnce(ended)
    await store.end()
    const calls = api.mock.calls.length
    store.updateDraft('不应提交')
    await store.answer()
    expect(api).toHaveBeenCalledTimes(calls)
  })
  it('ignores a late load for the previous route', async () => {
    let resolve!: (record: DefenseSession) => void
    api.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const store = useDefenseStore(),
      original = ready(),
      newer = { ...ready(), id: crypto.randomUUID() }
    const pending = store.load(original.id)
    api.mockResolvedValueOnce(newer)
    await store.load(newer.id)
    resolve(original)
    await pending
    expect(store.session?.id).toBe(newer.id)
  })
})
