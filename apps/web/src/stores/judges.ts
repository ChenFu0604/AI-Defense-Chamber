import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  judgeIds,
  type AnalysisRecord,
  type JudgeId,
  type JudgeStatement,
  type JudgeStatus,
  type Project,
  type AnalysisMode,
} from '@defense/shared'
import { requestJudgeQuestion } from '../services/judges-api'

export const useJudgesStore = defineStore('judges', () => {
  const selectedId = ref<JudgeId>('business')
  const pendingId = ref<JudgeId | null>(null)
  const busy = ref(false)
  const statuses = reactive<Record<JudgeId, JudgeStatus>>({
    business: 'waiting',
    technical: 'waiting',
    user: 'waiting',
    devil: 'waiting',
  })
  const statements = ref<JudgeStatement[]>([])
  const error = ref('')
  const activeId = computed(() => pendingId.value ?? selectedId.value)
  let contextKey = ''
  let epoch = 0
  let controller: AbortController | null = null
  function select(id: JudgeId) {
    selectedId.value = id
  }
  function cancel() {
    epoch++
    controller?.abort()
    controller = null
    if (pendingId.value) statuses[pendingId.value] = 'waiting'
    pendingId.value = null
    busy.value = false
  }
  function clear() {
    cancel()
    statements.value = []
    error.value = ''
    for (const id of judgeIds) statuses[id] = 'waiting'
  }
  function prepare(key: string) {
    if (contextKey === key) return
    clear()
    contextKey = key
    selectedId.value = 'business'
  }
  function complete(id: JudgeId) {
    if (statuses[id] === 'questioning') statuses[id] = 'completed'
  }
  async function run(project: Project, analysis: AnalysisRecord, mode: AnalysisMode, all = false) {
    if (busy.value) return
    if (statements.value.length >= 32) {
      error.value = '本轮已达 32 个问题，请清空本轮后继续。'
      return
    }
    busy.value = true
    error.value = ''
    const token = ++epoch
    const abort = new AbortController()
    controller = abort
    const ids = all ? judgeIds : [selectedId.value]
    try {
      for (const id of ids) {
        if (epoch !== token) return
        if (statements.value.length >= 32) {
          error.value = '本轮已达 32 个问题，请清空本轮后继续。'
          break
        }
        pendingId.value = id
        statuses[id] = 'analyzing'
        const result = await requestJudgeQuestion(
          {
            project,
            analysis,
            judgeId: id,
            mode,
            history: statements.value.map((item) => item.speech),
          },
          abort.signal,
        )
        if (epoch !== token) return
        statements.value.push(result)
        statuses[id] = 'questioning'
      }
    } catch (failure) {
      if (epoch !== token) return
      if (pendingId.value) statuses[pendingId.value] = 'error'
      error.value = failure instanceof Error ? failure.message : '提问失败，请重试。'
    } finally {
      if (epoch === token) {
        busy.value = false
        pendingId.value = null
        controller = null
      }
    }
  }
  return {
    selectedId,
    pendingId,
    activeId,
    busy,
    statuses,
    statements,
    error,
    select,
    prepare,
    run,
    cancel,
    clear,
    complete,
  }
})
