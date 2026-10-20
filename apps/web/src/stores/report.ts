import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { DefenseReport } from '@defense/shared'
import { requestReport, ReportApiError } from '../services/report-api'

export const useReportStore = defineStore('defense-report', () => {
  const report = ref<DefenseReport | null>(null)
  const status = ref<'idle' | 'loading' | 'generating' | 'missing' | 'success' | 'error'>('idle')
  const error = ref(''),
    errorCode = ref('')
  let sessionId = '',
    epoch = 0,
    controller: AbortController | null = null
  async function run(id: string, generate: boolean) {
    if (sessionId === id && ['loading', 'generating'].includes(status.value)) return
    controller?.abort()
    const token = ++epoch
    controller = new AbortController()
    if (sessionId !== id) report.value = null
    sessionId = id
    status.value = generate ? 'generating' : 'loading'
    error.value = ''
    errorCode.value = ''
    try {
      const result = await requestReport(id, generate, controller.signal)
      if (epoch !== token) return
      report.value = result
      status.value = 'success'
    } catch (failure) {
      if (epoch !== token) return
      const code = failure instanceof ReportApiError ? failure.code : 'REPORT_FAILED'
      errorCode.value = code
      if (code === 'REPORT_NOT_FOUND') status.value = 'missing'
      else {
        status.value = 'error'
        error.value = failure instanceof Error ? failure.message : '报告操作失败，请重试。'
      }
    } finally {
      if (epoch === token) controller = null
    }
  }
  function leave() {
    epoch++
    controller?.abort()
    controller = null
    status.value = 'idle'
  }
  return {
    report,
    status,
    error,
    errorCode,
    load: (id: string) => run(id, false),
    generate: (id: string) => run(id, true),
    leave,
  }
})
