import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { projectInputSchema, projectRecordResponseSchema, projectSchema, trainingPreferencesSchema, type TrainingPreferences, type AnalysisMode, type JudgeId, type Project } from '@defense/shared'
import { serverRequest } from '../services/server-api'
import { useAnalysisStore } from '../stores/analysis'
import { useDefenseStore } from '../stores/defense'

export function useTrainingPreparation(project: Ref<Project>) {
  const analyses = useAnalysisStore(), defense = useDefenseStore()
  const mode = ref<AnalysisMode>('live'), judgeId = ref<JudgeId>('business')
  const confirmed = ref(false), working = ref(false), error = ref('')
  const preferences = ref<TrainingPreferences>({ style: 'guided', goal: 'general', questionLimit: 5 })
  const state = computed(() => analyses.stateFor(project.value.id))
  const analysis = computed(() => state.value[mode.value])
  const busy = computed(() => working.value || defense.busy || state.value.status === 'loading' || state.value.restoring)
  let generation = 0
  watch(() => [project.value.id, JSON.stringify(projectInputSchema.parse(project.value))], (_value, previous) => {
    generation++
    if (previous) analyses.cancel(previous[0]!)
    defense.prepare()
    confirmed.value = false
    working.value = false
    error.value = ''
    void analyses.restore(project.value)
  }, { immediate: true })
  watch([mode, judgeId, preferences], () => {
    generation++
    analyses.cancel(project.value.id)
    defense.prepare()
    confirmed.value = false
    working.value = false
    error.value = ''
  }, { deep: true, flush: 'sync' })
  onScopeDispose(() => { generation++; analyses.cancel(project.value.id); defense.leave() })
  async function start() {
    if (!confirmed.value || busy.value) return null
    const token = generation, snapshot = projectSchema.parse(project.value), source = mode.value
    const selectedJudge = judgeId.value
    const settings = trainingPreferencesSchema.parse(preferences.value)
    working.value = true
    error.value = ''
    try {
      const unchanged = async () => JSON.stringify(await serverRequest('/projects/' + snapshot.id, projectRecordResponseSchema)) === JSON.stringify(snapshot)
      if (!await unchanged()) throw new Error('项目资料已在服务端更新，请刷新后重新核对。')
      if (token !== generation) return null
      if (!await analyses.restore(snapshot, true)) {
        if (token === generation) error.value = state.value.error || '无法读取服务端画像，请重试。'
        return null
      }
      if (token !== generation) return null
      const profile = analysis.value ?? await analyses.run(snapshot, source)
      if (token !== generation) return null
      if (!profile) { error.value = state.value.error || '项目分析尚未完成，可以重试。'; return null }
      if (!await unchanged()) throw new Error('分析期间项目资料发生变化，请刷新后重新确认，尚未创建训练。')
      if (token !== generation) return null
      const session = await defense.start({ project: snapshot, analysis: profile, mode: source, judgeId: selectedJudge, preferences: settings })
      return token === generation ? session : null
    } catch (failure) {
      if (token === generation) error.value = failure instanceof Error ? failure.message : '训练准备失败，请重试。'
      return null
    } finally {
      if (token === generation) working.value = false
    }
  }
  return { mode, judgeId, preferences, confirmed, state, analysis, busy, working, error, start }
}
