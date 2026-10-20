import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  answerRequestSchema,
  createDefenseRequestSchema,
  type CreateDefenseRequest,
  type DefenseSession,
  type DefenseOperation,
  type JudgeId,
} from '@defense/shared'
import { defenseApi, DefenseApiError } from '../services/defense-api'
import { rememberDefense, readDefenseDraft, saveDefenseDraft } from '../services/defense-storage'
import {
  archiveSession,
  readPendingCreation,
  savePendingCreation,
} from '../services/history-storage'

export const useDefenseStore = defineStore('defense-session', () => {
  const session = ref<DefenseSession | null>(null),
    draft = ref(''),
    busy = ref(false),
    error = ref(''),
    warning = ref('')
  const operation = ref<DefenseOperation | null>(null)
  let loadedId = '',
    epoch = 0
  let draftWritable = true
  let creation: CreateDefenseRequest | null = null
  const message = (failure: unknown) =>
    failure instanceof Error ? failure.message : '答辩操作失败。'
  function persist() {
    if (!session.value || !draftWritable) return
    try {
      saveDefenseDraft(session.value.id, draft.value, operation.value)
    } catch {
      warning.value = '浏览器草稿保存失败。已提交的记录仍保存在服务端，未提交输入请暂勿刷新。'
    }
  }
  function updateDraft(value: string) {
    draft.value = value
    draftWritable = true
    persist()
  }
  function apply(record: DefenseSession) {
    session.value = record
    const pending = record.pending
    if (pending) {
      if (pending.type === 'answer') {
        const answer = record.messages.find((v) => v.id === pending.answerMessageId)!.content
        draft.value = answer
        operation.value = {
          kind: 'answer',
          body: { requestId: pending.requestId, questionId: pending.questionId!, answer },
        }
      } else if (pending.type === 'initial')
        operation.value = { kind: 'question', body: { requestId: pending.requestId } }
      else
        operation.value = {
          kind: 'judge',
          body: {
            requestId: pending.requestId,
            questionId: pending.questionId!,
            judgeId: pending.judgeId,
          },
        }
    } else if (
      operation.value &&
      record.completed.some((v) => v.requestId === operation.value!.body.requestId)
    ) {
      if (operation.value.kind === 'answer' && draft.value.trim() === operation.value.body.answer)
        draft.value = ''
      operation.value = null
      error.value = ''
    }
    if (record.status === 'ended') operation.value = null
    try {
      rememberDefense(record)
    } catch {
      warning.value = '浏览器会话入口保存失败，可通过当前会话地址恢复服务端记录。'
    }
    persist()
    try {
      archiveSession(record)
    } catch (failure) {
      warning.value =
        failure instanceof Error ? failure.message : '本地历史归档失败，后端会话保留。'
    }
  }
  async function start(input: Omit<CreateDefenseRequest, 'requestId'>) {
    if (busy.value) return null
    busy.value = true
    error.value = ''
    const token = epoch
    const signature = (value: Omit<CreateDefenseRequest, 'requestId'>) =>
      JSON.stringify(
        createDefenseRequestSchema.parse({
          ...value,
          requestId: '00000000-0000-4000-8000-000000000000',
        }),
      )
    try {
      if (!creation || signature(creation) !== signature(input)) {
        const pending = readPendingCreation()
        creation =
          pending?.kind === 'create' && signature(pending.input) === signature(input)
            ? pending.input
            : { ...input, requestId: crypto.randomUUID() }
      }
      savePendingCreation({ kind: 'create', input: creation })
      try {
        rememberDefense({ id: creation.requestId, project: input.project, mode: input.mode })
      } catch {
        warning.value = '浏览器入口保存失败，请保留会话地址。'
      }
      const record = await defenseApi('', creation)
      if (epoch !== token) return null
      if (record.id !== creation.requestId) throw new Error('创建会话返回标识不一致。')
      draft.value = ''
      operation.value = null
      loadedId = record.id
      draftWritable = true
      apply(record)
      creation = null
      try {
        savePendingCreation(null)
      } catch {
        warning.value = '会话已创建，但本地待创建标记清理失败，请保留会话地址。'
      }
      return record
    } catch (failure) {
      if (epoch === token) error.value = message(failure)
      return null
    } finally {
      if (epoch === token) busy.value = false
    }
  }
  async function load(id: string) {
    if (busy.value && loadedId === id) return
    const token = ++epoch
    if (loadedId !== id) {
      session.value = null
      draft.value = ''
      operation.value = null
      warning.value = ''
      loadedId = id
      draftWritable = true
      try {
        const saved = readDefenseDraft(id)
        draft.value = saved.answer
        operation.value = saved.operation
      } catch {
        draftWritable = false
        warning.value = '无法读取本地草稿，将尝试从服务端恢复已提交记录。'
      }
    }
    busy.value = true
    error.value = ''
    try {
      const record = await defenseApi('/' + encodeURIComponent(id))
      if (token === epoch) apply(record)
    } catch (failure) {
      if (token === epoch) error.value = message(failure)
    } finally {
      if (token === epoch) busy.value = false
    }
  }
  async function retrain(sourceId: string, judgeId: JudgeId) {
    if (busy.value) return null
    busy.value = true
    error.value = ''
    const token = epoch
    try {
      const previous = readPendingCreation()
      const input =
        previous?.kind === 'retrain' &&
        previous.sourceId === sourceId &&
        previous.input.judgeId === judgeId
          ? previous.input
          : { requestId: crypto.randomUUID(), judgeId }
      savePendingCreation({ kind: 'retrain', sourceId, input })
      const record = await defenseApi('/' + sourceId + '/retrain', input)
      if (epoch !== token) return null
      if (record.id !== input.requestId || record.training?.sourceSessionId !== sourceId)
        throw new Error('二次训练返回的会话标识或来源不一致。')
      draft.value = ''
      operation.value = null
      loadedId = record.id
      draftWritable = true
      apply(record)
      try {
        savePendingCreation(null)
      } catch {
        warning.value = '会话已创建，本地创建标记清理失败。'
      }
      return record
    } catch (failure) {
      if (epoch === token) error.value = message(failure)
      return null
    } finally {
      if (epoch === token) busy.value = false
    }
  }
  async function send(next: DefenseOperation) {
    if (
      !session.value ||
      busy.value ||
      session.value.status === 'ended' ||
      session.value.status === 'generating'
    )
      return
    busy.value = true
    error.value = ''
    operation.value = next
    persist()
    const id = session.value.id,
      token = epoch
    try {
      const record = await defenseApi('/' + id + '/' + next.kind, next.body)
      if (token === epoch) apply(record)
    } catch (failure) {
      if (token !== epoch) return
      error.value = message(failure)
      try {
        const recovered = await defenseApi('/' + id)
        if (token === epoch) apply(recovered)
      } catch {
        /* Preserve input and original operation for a safe retry. */
      }
      if (
        token === epoch &&
        !session.value?.pending &&
        failure instanceof DefenseApiError &&
        [
          'VALIDATION_ERROR',
          'STALE_QUESTION',
          'IDEMPOTENCY_CONFLICT',
          'SAME_JUDGE',
          'TURN_LIMIT',
        ].includes(failure.code)
      ) {
        operation.value = null
        persist()
      }
    } finally {
      if (token === epoch) busy.value = false
    }
  }
  async function initial() {
    await send(operation.value ?? { kind: 'question', body: { requestId: crypto.randomUUID() } })
  }
  async function answer() {
    if (!session.value?.currentQuestionId || operation.value) return
    const parsed = answerRequestSchema.safeParse({
      requestId: crypto.randomUUID(),
      questionId: session.value.currentQuestionId,
      answer: draft.value,
    })
    if (!parsed.success) {
      error.value = '请填写 1～4000 字的回答。'
      return
    }
    await send({ kind: 'answer', body: parsed.data })
  }
  async function switchJudge(judgeId: JudgeId) {
    if (!session.value?.currentQuestionId || operation.value) return
    await send({
      kind: 'judge',
      body: {
        requestId: crypto.randomUUID(),
        questionId: session.value.currentQuestionId,
        judgeId,
      },
    })
  }
  async function retry() {
    if (operation.value) await send(operation.value)
  }
  async function end() {
    if (!session.value || busy.value || session.value.status === 'generating') return
    busy.value = true
    error.value = ''
    const id = session.value.id,
      token = epoch
    try {
      const record = await defenseApi('/' + id + '/end', {})
      if (token === epoch) apply(record)
    } catch (failure) {
      if (token === epoch) error.value = message(failure)
    } finally {
      if (token === epoch) busy.value = false
    }
  }
  function leave() {
    epoch++
    busy.value = false
    persist()
  }
  return {
    session,
    draft,
    busy,
    error,
    warning,
    operation,
    start,
    retrain,
    load,
    initial,
    answer,
    switchJudge,
    retry,
    end,
    updateDraft,
    leave,
  }
})
