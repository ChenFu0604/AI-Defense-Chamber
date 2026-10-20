import { init, use, type EChartsCoreOption } from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import { RadarComponent, AriaComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { reportDimensionIds, reportDimensionLabels, type ReportDimensions } from '@defense/shared'

use([RadarChart, RadarComponent, AriaComponent, SVGRenderer])
export function buildRadarOption(dimensions: ReportDimensions): EChartsCoreOption {
  return {
    animationDuration: 450,
    animationDurationUpdate: 350,
    aria: {
      enabled: true,
      description: 'AI 对本次答辩的五维训练建议评分，各维度满分 100 分，并非客观能力测评。',
    },
    radar: {
      center: ['50%', '52%'],
      radius: '60%',
      splitNumber: 4,
      indicator: reportDimensionIds.map((id) => ({ name: reportDimensionLabels[id], max: 100 })),
      axisName: { color: '#c7cbde', fontSize: 11 },
      axisLine: { lineStyle: { color: '#373b53' } },
      splitLine: { lineStyle: { color: '#373b53' } },
      splitArea: { areaStyle: { color: ['#171925', '#1c2030'] } },
    },
    series: [
      {
        type: 'radar',
        symbolSize: 6,
        lineStyle: { color: '#a997ff', width: 2 },
        itemStyle: { color: '#b4a5ff' },
        areaStyle: { color: 'rgba(144,117,255,0.3)' },
        data: [{ name: '本次答辩', value: reportDimensionIds.map((id) => dimensions[id].score) }],
      },
    ],
  }
}
export function createRadarChart(element: HTMLElement) {
  const chart = init(element, undefined, { renderer: 'svg' })
  return {
    update: (dimensions: ReportDimensions) =>
      chart.setOption(buildRadarOption(dimensions), { notMerge: true }),
    resize: () => chart.resize(),
    dispose: () => chart.dispose(),
  }
}
