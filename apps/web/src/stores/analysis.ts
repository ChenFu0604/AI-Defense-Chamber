import { reactive } from 'vue'
import { defineStore } from 'pinia'
import { analysisListResponseSchema, analysisMatchesProject, projectInputSchema, projectSchema,
  type AnalysisMode, type AnalysisRecord, type Project } from '@defense/shared'
import { AnalysisApiError, requestProjectAnalysis } from '../services/analysis-api'
import { ServerApiError, serverRequest } from '../services/server-api'

export interface ProjectAnalysisState {
  status: 'idle' | 'loading' | 'success' | 'error' | 'cancelled'
  activeMode: AnalysisMode
  live: AnalysisRecord | null
  demo: AnalysisRecord | null
  error: string
  errorCode: string
  warning: string
  loaded: boolean
  restoring: boolean
}
export const useAnalysisStore = defineStore('analysis', () => {
  const states = reactive<Record<string, ProjectAnalysisState>>({})
  const signatures = new Map<string, string>()
  const requests = new Map<string, { token: symbol; controller: AbortController }>()
  const reads = new Map<string, { token: symbol; controller: AbortController; promise: Promise<boolean> }>()
  function stateFor(id: string): ProjectAnalysisState {
    if (!states[id]) states[id] = {status: 'idle', activeMode: 'live', live: null, demo: null,
      error: '', errorCode: '', warning: '', loaded: false, restoring: false}
    return states[id]!
  }
  function restore(project: Project, force = false): Promise<boolean> {
    const state = stateFor(project.id)
    const signature = JSON.stringify(projectInputSchema.parse(project))
    const changed = signatures.has(project.id) && signatures.get(project.id) !== signature
    if (changed) {
      cancel(project.id)
      state.live = null; state.demo = null; state.loaded = false; state.status = 'idle'
      state.error = ''; state.errorCode = ''; state.warning = ''
    }
    signatures.set(project.id, signature)
    const existing = reads.get(project.id)
    if (existing) return existing.promise
    if (!force && state.loaded) return Promise.resolve(true)
    const token = Symbol(project.id), controller = new AbortController()
    state.restoring = true
    const promise = (async () => {
      try {
        const records = await serverRequest('/projects/' + project.id + '/analyses', analysisListResponseSchema, {signal: controller.signal})
        if (reads.get(project.id)?.token !== token) return false
        state.live = records.find(record => record.mode === 'live' && analysisMatchesProject(record, project)) ?? null
        state.demo = records.find(record => record.mode === 'demo' && analysisMatchesProject(record, project)) ?? null
        state.activeMode = state.live ? 'live' : state.demo ? 'demo' : 'live'
        state.status = state.live || state.demo ? 'success' : 'idle'
        state.error = ''; state.errorCode = ''; state.loaded = true
        state.warning = !state.live && !state.demo && records.some(record => record.projectId === project.id)
          ? '项目资料已变化，旧画像未展示，请重新分析。' : ''
        return true
      } catch (failure) {
        if (reads.get(project.id)?.token !== token) return false
        state.loaded = false; state.live = null; state.demo = null; state.status = 'error'
        state.error = failure instanceof Error ? failure.message : '读取服务端项目画像失败，请重试。'
        state.errorCode = failure instanceof ServerApiError ? failure.code : 'ANALYSIS_READ_FAILED'
        return false
      } finally {
        if (reads.get(project.id)?.token === token) {reads.delete(project.id); state.restoring = false}
      }
    })()
    reads.set(project.id, {token, controller, promise})
    return promise
  }
  async function run(project: Project, mode: AnalysisMode = 'live') {
    const state = stateFor(project.id)
    if (state.status === 'loading') return null
    const read = reads.get(project.id)
    if (read) {reads.delete(project.id); read.controller.abort(); state.restoring = false}
    const token = Symbol(project.id), controller = new AbortController()
    requests.set(project.id, {token, controller})
    state.status = 'loading'; state.activeMode = mode; state.error = ''; state.errorCode = ''
    try {
      const snapshot = projectSchema.parse(project)
      const result = await requestProjectAnalysis(snapshot, mode, controller.signal)
      if (requests.get(project.id)?.token !== token) return null
      if (!analysisMatchesProject(result, snapshot)) throw new Error('分析结果与本次项目资料不一致，未展示该结果。')
      state[mode] = result; state.status = 'success'; state.loaded = true
      signatures.set(project.id, JSON.stringify(result.projectSnapshot)); state.warning = ''
      return result
    } catch (failure) {
      if (requests.get(project.id)?.token !== token) return null
      state.status = failure instanceof AnalysisApiError && failure.code === 'REQUEST_CANCELLED' ? 'cancelled' : 'error'
      state.errorCode = failure instanceof AnalysisApiError ? failure.code : 'UNKNOWN_ERROR'
      state.error = failure instanceof Error ? failure.message : '项目分析失败，请重试。'
      return null
    } finally {if (requests.get(project.id)?.token === token) requests.delete(project.id)}
  }
  function cancel(projectId: string) {
    const read = reads.get(projectId)
    if (read) {reads.delete(projectId); read.controller.abort(); stateFor(projectId).restoring = false}
    const pending = requests.get(projectId)
    if (!pending) return
    requests.delete(projectId); pending.controller.abort()
    const state = stateFor(projectId)
    state.status = 'cancelled'; state.error = ''; state.errorCode = ''
  }
  function showMode(projectId: string, mode: AnalysisMode) {
    const state = stateFor(projectId)
    if (state.status !== 'loading' && !state.restoring && state[mode]) state.activeMode = mode
  }
  return {states, stateFor, restore, run, cancel, showMode}
})
