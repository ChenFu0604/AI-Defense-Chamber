import { reactive } from 'vue'
import { defineStore } from 'pinia'
import {
  analysisMatchesProject,
  projectInputSchema,
  projectSchema,
  type AnalysisMode,
  type AnalysisRecord,
  type Project,
} from '@defense/shared'
import { AnalysisApiError, requestProjectAnalysis } from '../services/analysis-api'
import { readAnalysisRecords, saveAnalysisRecord } from '../services/analysis-storage'

export interface ProjectAnalysisState {
  status: 'idle' | 'loading' | 'success' | 'error' | 'cancelled'
  activeMode: AnalysisMode
  live: AnalysisRecord | null
  demo: AnalysisRecord | null
  error: string
  errorCode: string
  warning: string
  loaded: boolean
}
export const useAnalysisStore = defineStore('analysis', () => {
  const states = reactive<Record<string, ProjectAnalysisState>>({})
  const signatures = new Map<string, string>()
  const requests = new Map<string, { token: symbol; controller: AbortController }>()
  function stateFor(id: string): ProjectAnalysisState {
    if (!states[id])
      states[id] = {
        status: 'idle',
        activeMode: 'live',
        live: null,
        demo: null,
        error: '',
        errorCode: '',
        warning: '',
        loaded: false,
      }
    return states[id]!
  }
  function restore(project: Project) {
    const state = stateFor(project.id)
    const signature = JSON.stringify(projectInputSchema.parse(project))
    if (state.loaded && signatures.get(project.id) === signature) return
    if (signatures.has(project.id) && signatures.get(project.id) !== signature) {
      cancel(project.id)
      state.live = null
      state.demo = null
      state.status = 'idle'
      state.error = ''
      state.errorCode = ''
      state.warning = ''
    }
    signatures.set(project.id, signature)
    state.loaded = true
    try {
      const records = readAnalysisRecords()
      state.live =
        records.find((item) => item.mode === 'live' && analysisMatchesProject(item, project)) ??
        null
      state.demo =
        records.find((item) => item.mode === 'demo' && analysisMatchesProject(item, project)) ??
        null
      state.activeMode = state.live ? 'live' : state.demo ? 'demo' : 'live'
      if (state.live || state.demo) state.status = 'success'
      else if (records.some((item) => item.projectId === project.id))
        state.warning = '项目资料已变化，旧画像未展示，请重新分析。'
    } catch (error) {
      state.warning = error instanceof Error ? error.message : '读取本地画像失败。'
    }
  }
  async function run(project: Project, mode: AnalysisMode = 'live') {
    const state = stateFor(project.id)
    if (state.status === 'loading') return null
    const token = Symbol(project.id)
    const controller = new AbortController()
    requests.set(project.id, { token, controller })
    state.status = 'loading'
    state.activeMode = mode
    state.error = ''
    state.errorCode = ''
    try {
      const snapshot = projectSchema.parse(project)
      const result = await requestProjectAnalysis(snapshot, mode, controller.signal)
      if (requests.get(project.id)?.token !== token) return null
      state[mode] = result
      state.status = 'success'
      state.loaded = true
      signatures.set(project.id, JSON.stringify(result.projectSnapshot))
      state.warning = ''
      try {
        saveAnalysisRecord(result)
      } catch (error) {
        state.warning = error instanceof Error ? error.message : '画像已生成，但未能保存到浏览器。'
      }
      return result
    } catch (error) {
      if (requests.get(project.id)?.token !== token) return null
      state.status =
        error instanceof AnalysisApiError && error.code === 'REQUEST_CANCELLED'
          ? 'cancelled'
          : 'error'
      state.errorCode = error instanceof AnalysisApiError ? error.code : 'UNKNOWN_ERROR'
      state.error = error instanceof Error ? error.message : '项目分析失败，请重试。'
      return null
    } finally {
      if (requests.get(project.id)?.token === token) requests.delete(project.id)
    }
  }
  function cancel(projectId: string) {
    const pending = requests.get(projectId)
    if (!pending) return
    requests.delete(projectId)
    pending.controller.abort()
    const state = stateFor(projectId)
    state.status = 'cancelled'
    state.error = ''
    state.errorCode = ''
  }
  function showMode(projectId: string, mode: AnalysisMode) {
    const state = stateFor(projectId)
    if (state.status !== 'loading' && state[mode]) state.activeMode = mode
  }
  return { states, stateFor, restore, run, cancel, showMode }
})
