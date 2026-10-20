import { describe, expect, it } from 'vitest'
import { init } from 'echarts/core'
import { buildRadarOption } from '../components/report/radar-chart'
import { reportDimensionIds, reportDimensionLabels } from '@defense/shared'
import { reportOutputFixture } from '../../../../tests/fixtures/report'
describe('ECharts ability radar', () => {
  it('renders the five real report values and updates the SVG when scores change', () => {
    const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 360 })
    try {
      const dimensions = reportOutputFixture().dimensions
      chart.setOption(buildRadarOption(dimensions), { notMerge: true })
      const first = chart.renderToSVGString()
      for (const id of reportDimensionIds) expect(first).toContain(reportDimensionLabels[id])
      const values = () =>
        (chart.getOption().series as { data: { value: number[] }[] }[])[0]!.data[0]!.value
      expect(values()).toEqual([71, 52, 64, 59, 66])
      dimensions.logic.score = 95
      dimensions.evidence.score = 83
      chart.setOption(buildRadarOption(dimensions), { notMerge: true })
      expect(values()).toEqual([95, 83, 64, 59, 66])
      expect(chart.renderToSVGString()).not.toEqual(first)
      expect(chart.renderToSVGString()).toContain('<svg')
    } finally {
      chart.dispose()
    }
    expect(chart.isDisposed()).toBe(true)
  })
})
