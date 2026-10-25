import { computed, getCurrentInstance, onMounted, onScopeDispose, ref, watch, type Ref } from 'vue'
import { projectSchema, projectRecordResponseSchema, taskListResponseSchema, analysisMatchesProject, type HistoryEntry, type JudgeId, type RetrainRequest } from '@defense/shared'
import { useProjectsStore } from '../stores/projects'
import { useAnalysisStore } from '../stores/analysis'
import { useDefenseStore } from '../stores/defense'
import { useImprovementsStore } from '../stores/improvements'
import { serverRequest } from '../services/server-api'
import { readPendingCreation, type PendingCreation } from '../services/history-storage'

export function useRetrainingPreparation(id: Ref<string>, entry: Ref<HistoryEntry | undefined>, requestedTask: Ref<string>) {
  const projects = useProjectsStore(), analyses = useAnalysisStore(), defense = useDefenseStore(), tasks = useImprovementsStore()
  const sourceMode = ref<'original' | 'current'>('original'), judgeId = ref<JudgeId>('business')
  const confirmed = ref(false), working = ref(false), error = ref(''), selectedIds = ref<string[]>([])
  const pending = ref<PendingCreation | null>(null)
  const currentProject = computed(() => projects.findProject(entry.value?.session.project.id ?? ''))
  const availableTasks = computed(() => tasks.tasks.filter(t => t.sourceReportId === entry.value?.report?.id))
  const chosen = computed(() => availableTasks.value.filter(t => selectedIds.value.includes(t.id)).sort((a,b) => a.improvementIndex - b.improvementIndex))
  const busy = computed(() => working.value || defense.busy)
  let generation = 0
  let appliedRequest = ''
  function restorePending() {
    try { const saved = readPendingCreation(); pending.value = saved?.kind === 'retrain' && saved.sourceId === id.value ? saved : null }
    catch (failure) { error.value = failure instanceof Error ? failure.message : '待创建记录读取失败。' }
  }
  watch(id, () => { generation++; appliedRequest = ''; confirmed.value = false; error.value = ''; defense.prepare(); sourceMode.value = 'original'; selectedIds.value = []; restorePending() }, {immediate: true, flush: 'sync'})
  watch([requestedTask, availableTasks], () => {
    if (requestedTask.value && appliedRequest !== requestedTask.value && availableTasks.value.some(t => t.id === requestedTask.value)) {
      selectedIds.value = [requestedTask.value]; appliedRequest = requestedTask.value
    }
  }, {immediate: true, flush: 'sync'})
  watch(() => [sourceMode.value, judgeId.value, JSON.stringify(currentProject.value), JSON.stringify(chosen.value)], () => {
    generation++; confirmed.value = false; error.value = ''
  }, {flush: 'sync'})
  if (getCurrentInstance()) onMounted(restorePending)
  onScopeDispose(() => { generation++; if (working.value && currentProject.value) analyses.cancel(currentProject.value.id); defense.leave() })
  async function run(retry: boolean) {
    if (!confirmed.value || busy.value || !entry.value?.report) return null
    const token = generation
    working.value = true; error.value = ''
    try {
      let options: Pick<RetrainRequest, 'current' | 'taskUpdates'> = {}, selectedJudge = judgeId.value
      if (retry) {
        restorePending()
        if (pending.value?.kind !== 'retrain') throw new Error('没有待重试的复训创建请求。')
        const {current, taskUpdates} = pending.value.input
        options = {...(current ? {current} : {}), ...(taskUpdates ? {taskUpdates} : {})}
        selectedJudge = pending.value.input.judgeId
      } else {
        restorePending()
        if (pending.value) throw new Error('上次创建结果尚待确认，请先读取会话或使用“安全重试原创建”。')
        if (selectedIds.value.length !== chosen.value.length || chosen.value.length > 5) throw new Error('所选改进任务已变化，最多选择 5 项，请重新核对。')
        if (chosen.value.length) {
          const saved = await serverRequest('/improvements', taskListResponseSchema)
          if (token !== generation) return null
          if (chosen.value.some(t => JSON.stringify(saved.find(s => s.id === t.id)) !== JSON.stringify(t)))
            throw new Error('任务已在其他页面更新，请刷新后重新核对。')
          options.taskUpdates = chosen.value.map(t => ({improvementIndex: t.improvementIndex, status: t.status, note: t.note,
            ...(t.attachments?.length ? {attachments: t.attachments} : {})}))
        }
        if (sourceMode.value === 'current') {
          if (!currentProject.value) throw new Error('服务端没有这个项目，请选择原资料或先恢复项目。')
          const project = projectSchema.parse(currentProject.value)
          const unchanged = async () => JSON.stringify(await serverRequest('/projects/' + project.id, projectRecordResponseSchema)) === JSON.stringify(project)
          if (!await unchanged()) throw new Error('项目资料已更新，请刷新页面后重新确认。')
          if (token !== generation) return null
          if (!await analyses.restore(project, true)) throw new Error(analyses.stateFor(project.id).error || '无法读取服务端画像，请重试。')
          if (token !== generation) return null
          const analysis = analyses.stateFor(project.id).live ?? await analyses.run(project, 'live')
          if (token !== generation) return null
          if (!analysis || !analysisMatchesProject(analysis, project)) throw new Error(analyses.stateFor(project.id).error || '当前版本的项目分析尚未完成，请重试。')
          if (!await unchanged()) throw new Error('分析期间项目资料发生变化，未创建训练，请刷新后重新确认。')
          options.current = {project, analysis}
        }
      }
      if (!retry && chosen.value.length) {
        const saved = await serverRequest('/improvements', taskListResponseSchema)
        if (token !== generation) return null
        if (chosen.value.some(task => JSON.stringify(saved.find(current => current.id === task.id)) !== JSON.stringify(task)))
          throw new Error('准备期间改进任务已更新，请刷新后重新核对，尚未创建训练。')
      }
      if (token !== generation) return null
      const session = await defense.retrain(id.value, selectedJudge, options)
      if (token !== generation) return null
      restorePending()
      return session
    } catch (failure) {
      if (token === generation) error.value = failure instanceof Error ? failure.message : '复训准备失败。'
      return null
    } finally { if (token === generation || !defense.busy) working.value = false }
  }
  return {sourceMode, judgeId, confirmed, working, error, selectedIds, pending, currentProject, availableTasks, busy,
    start: () => run(false), retryPending: () => run(true)}
}
