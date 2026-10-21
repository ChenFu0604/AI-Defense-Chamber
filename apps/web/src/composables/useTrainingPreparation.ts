import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { projectInputSchema, projectSchema, type AnalysisMode, type JudgeId, type Project } from '@defense/shared'
import { useAnalysisStore } from '../stores/analysis'
import { useDefenseStore } from '../stores/defense'

export function useTrainingPreparation(project: Ref<Project>) {
  const analyses = useAnalysisStore(), defense = useDefenseStore()
  const mode = ref<AnalysisMode>('live'), judgeId = ref<JudgeId>('business')
  const confirmed = ref(false), working = ref(false), error = ref('')
  const state = computed(() => analyses.stateFor(project.value.id))
  const analysis = computed(() => state.value[mode.value])
  const busy = computed(() => working.value || defense.busy || state.value.status === 'loading')
  let generation = 0
  watch(() => [project.value.id, JSON.stringify(projectInputSchema.parse(project.value))], (_value, previous) => {
    generation++
    if (previous) analyses.cancel(previous[0]!)
    defense.prepare()
    confirmed.value = false
    working.value = false
    error.value = ''
    analyses.restore(project.value)
  }, { immediate: true })
  watch(mode, () => {
    generation++
    analyses.cancel(project.value.id)
    defense.prepare()
    confirmed.value = false
    working.value = false
    error.value = ''
  })
  onScopeDispose(() => { generation++; analyses.cancel(project.value.id); defense.leave() })
  async function start() {
    if (!confirmed.value || busy.value) return null
    const token = generation, snapshot = projectSchema.parse(project.value), source = mode.value
    const selectedJudge = judgeId.value
    working.value = true
    error.value = ''
    try {
      const profile = analysis.value ?? await analyses.run(snapshot, source)
      if (token !== generation) return null
      if (!profile) { error.value = state.value.error || '项目分析尚未完成，可以重试。'; return null }
      const session = await defense.start({ project: snapshot, analysis: profile, mode: source, judgeId: selectedJudge })
      return token === generation ? session : null
    } finally {
      if (token === generation) working.value = false
    }
  }
  return { mode, judgeId, confirmed, state, analysis, busy, working, error, start }
}
