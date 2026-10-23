import { analysisMatchesProject, analysisRecordSchema, retrainingFocusSchema, type DefenseSession, type DefenseReport, type RetrainRequest } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'

export function buildRetrainingPlan(source: DefenseSession, report: DefenseReport, input: RetrainRequest) {
  const project = input.current?.project ?? source.project
  const analysis = input.current?.analysis ?? source.analysis
  if (project.id !== source.project.id || project.createdAt !== source.project.createdAt ||
    Date.parse(project.updatedAt) < Date.parse(source.project.updatedAt) ||
    analysis.mode !== 'live' || !analysisRecordSchema.safeParse(analysis).success || !analysisMatchesProject(analysis, project))
    throw new AppError(400, 'RETRAIN_PROJECT_MISMATCH', '复训必须使用同一项目的原资料或更新版本，并提供匹配的真实画像。')
  const tasks = (input.taskUpdates ?? []).map(update => {
    const item = report.output.improvements[update.improvementIndex]
    if (!item) throw new AppError(400, 'RETRAIN_TASK_NOT_FOUND', '所选任务不属于原报告中的改进建议。')
    return {...update, title: item.title, action: item.action, acceptanceCriteria: item.acceptanceCriteria}
  })
  const focus = tasks.length
    ? tasks.map(t => `${t.title}：${t.action} 完成标准：${t.acceptanceCriteria}`)
    : [...report.output.weaknesses.slice(0, 2).map(t => `${t.title}：${t.detail}`),
       ...report.output.improvements.slice(0, 2).map(t => `${t.title}：${t.action} 完成标准：${t.acceptanceCriteria}`)]
  const training = retrainingFocusSchema.parse({sourceSessionId: source.id, sourceReportId: report.id,
    focus: focus.map(t => t.slice(0, 1500)), projectSource: input.current ? 'current' : 'original',
    sourceProjectUpdatedAt: source.project.updatedAt, ...(tasks.length ? {tasks} : {})})
  return {project, analysis, training}
}
