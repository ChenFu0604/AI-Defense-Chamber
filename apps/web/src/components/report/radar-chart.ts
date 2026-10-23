import { init, use, type EChartsCoreOption } from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import { RadarComponent, AriaComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { reportDimensionIds, reportDimensionLabels, type ReportDimensions } from '@defense/shared'
import { readChartPalette, prefersReducedChartMotion, type ChartPalette } from '../chart-theme'

use([RadarChart, RadarComponent, AriaComponent, SVGRenderer])
export function buildRadarOption(
  dimensions: ReportDimensions,
  palette: ChartPalette = readChartPalette(),
  reducedMotion = prefersReducedChartMotion(),
): EChartsCoreOption {
  return {
    animation: !reducedMotion,
    animationDuration: 240,
    animationDurationUpdate: 200,
    aria: {
      enabled: true,
      description: 'AI 对本次答辩的五维训练建议评分，各维度满分 100 分，并非客观能力测评。',
    },
    radar: {
      center: ['50%', '52%'],
      radius: '60%',
      splitNumber: 4,
      indicator: reportDimensionIds.map((id) => ({ name: reportDimensionLabels[id], max: 100 })),
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
        data: [{ name: '本次答辩', value: reportDimensionIds.map((id) => dimensions[id].score) }],
      },
    ],
  }
}
export function createRadarChart(element: HTMLElement) {
  const chart = init(element, undefined, { renderer: 'svg' })
  return {
    update: (dimensions: ReportDimensions) =>
      chart.setOption(buildRadarOption(dimensions, readChartPalette(element)), { notMerge: true }),
    resize: () => chart.resize(),
    dispose: () => chart.dispose(),
  }
}
