import { init, use, type EChartsCoreOption } from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import { RadarComponent, AriaComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { getDimensionAssessment, reportDimensionIds, reportDimensionLabels, type AnyReportDimensions } from '@defense/shared'
import { readChartPalette, prefersReducedChartMotion, type ChartPalette } from '../chart-theme'

use([RadarChart, RadarComponent, AriaComponent, SVGRenderer])
export function buildRadarOption(
  dimensions: AnyReportDimensions,
  palette: ChartPalette = readChartPalette(),
  reducedMotion = prefersReducedChartMotion(),
): EChartsCoreOption {
  const complete = reportDimensionIds.every((id) =>
    getDimensionAssessment(dimensions[id]) !== 'insufficient' &&
    typeof dimensions[id].score === 'number' && Number.isFinite(dimensions[id].score))
  const legacy = reportDimensionIds.some((id) => getDimensionAssessment(dimensions[id]) === 'legacy')
  return {
    animation: !reducedMotion,
    animationDuration: 240,
    animationDurationUpdate: 200,
    aria: {
      enabled: true,
      description: !complete
        ? '本场存在未充分评估的维度，仅显示五维坐标，不绘制评分多边形；缺少的分数不按零分处理。已评分维度见文字列表。'
        : legacy
          ? '旧版报告保存的五维评分，观察覆盖未标注。各维度满分 100 分，属于 AI 主观训练建议。'
          : 'AI 对本次答辩的五维训练建议评分，各维度满分 100 分，并非客观能力测评。',
    },
    radar: {
      center: ['50%', '52%'],
      radius: '60%',
      splitNumber: 4,
      indicator: reportDimensionIds.map((id) => ({
        name: reportDimensionLabels[id] + (getDimensionAssessment(dimensions[id]) === 'insufficient' ? '\n未充分评估' : ''),
        max: 100,
      })),
      axisName: { color: palette.label, fontSize: 12 },
      axisLine: { lineStyle: { color: palette.grid } },
      splitLine: { lineStyle: { color: palette.grid } },
      splitArea: { areaStyle: { color: [palette.surface, palette.area] } },
    },
    series: [
      {
        type: 'radar',
        symbolSize: 6,
        lineStyle: { color: palette.line, width: 2 },
        itemStyle: { color: palette.line },
        areaStyle: { color: palette.fill },
        data: complete ? [{ name: legacy ? '旧版保存评分' : '本次答辩', value: reportDimensionIds.map((id) => dimensions[id].score) }] : [],
      },
    ],
  }
}
export function createRadarChart(element: HTMLElement) {
  const chart = init(element, undefined, { renderer: 'svg' })
  return {
    update: (dimensions: AnyReportDimensions) =>
      chart.setOption(buildRadarOption(dimensions, readChartPalette(element)), { notMerge: true }),
    resize: () => chart.resize(),
    dispose: () => chart.dispose(),
  }
}
