import { z } from 'zod'
import { buildRiskGraph, type AnalysisMode, type DefenseReport } from '@defense/shared'
import { readProjects } from './project-storage'
import { readAnalysisRecords } from './analysis-storage'
import { defenseApi } from './defense-api'
import { requestReport, ReportApiError } from './report-api'

export type RiskMapSource =
  | { kind: 'project'; id: string; mode: AnalysisMode }
  | { kind: 'session'; id: string }
export async function loadRiskMap(source: RiskMapSource, signal?: AbortSignal) {
  if (!z.uuid().safeParse(source.id).success) throw new Error('项目或会话 ID 无效。')
  signal?.throwIfAborted()
  if (source.kind === 'project') {
    const project = readProjects().find((item) => item.id === source.id)
    if (!project) throw new Error('当前浏览器没有该项目，请返回项目列表或从答辩报告打开漏洞地图。')
    const analysis =
      readAnalysisRecords().find(
        (item) => item.projectId === project.id && item.mode === source.mode,
      ) ?? null
    return {
      title: project.name,
      graph: buildRiskGraph({ project, analysis, session: null, report: null }),
      notice: analysis
        ? '根据已保存的项目画像整理；此入口不包含答辩报告，可从具体答辩报告查看会话漏洞地图。'
        : '当前没有对应模式的项目画像。请先分析项目；不会从项目名称或技术名词猜测风险。',
    }
  }
  const session = await defenseApi('/' + source.id)
  signal?.throwIfAborted()
  let report: DefenseReport | null = null
  let notice = '根据项目画像与已保存的逐轮风险整理。'
  if (session.mode === 'live' && session.status === 'ended') {
    try {
      report = await requestReport(session.id, false, signal)
    } catch (error) {
      if (!(error instanceof ReportApiError) || error.code !== 'REPORT_NOT_FOUND') throw error
      notice += '本场尚未生成评分报告，目前不包含报告问题；生成报告后可重新读取。'
    }
  } else if (session.status !== 'ended') notice += '答辩尚未结束，当前不包含最终评分报告。'
  if (report) notice = '根据本场会话的项目画像、逐轮风险和已保存评分报告整理；读取地图不调用模型。'
  return {
    title: session.project.name,
    graph: buildRiskGraph({
      project: session.project,
      analysis: session.analysis,
      session,
      report,
    }),
    notice,
  }
}
