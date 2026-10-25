import { describe, expect, it } from 'vitest'
import { init } from 'echarts/core'
import { buildRadarOption } from '../components/report/radar-chart'
import { reportDimensionIds, reportDimensionLabels, type ReportDimensions } from '@defense/shared'
import { reportOutputFixture } from '../../../../tests/fixtures/report'

function assessedDimensions(): ReportDimensions {
  const original = reportOutputFixture().dimensions
  return Object.fromEntries(reportDimensionIds.map(id => [id, {
    ...original[id], status: 'assessed',
  }])) as ReportDimensions
}

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

  it('keeps the five axes but omits the polygon when a dimension is insufficient', () => {
    const dimensions = assessedDimensions()
    dimensions.technical = { status: 'insufficient', score: null, reason: '本轮没有讨论技术实现。', references: [] }
    const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 360 })
    try {
      chart.setOption(buildRadarOption(dimensions), { notMerge: true })
      const option = chart.getOption()
      expect((option.series as { data: unknown[] }[])[0]!.data).toEqual([])
      expect((option.radar as { indicator: unknown[] }[])[0]!.indicator).toHaveLength(5)
      expect(chart.renderToSVGString()).toContain('未充分评估')
    } finally { chart.dispose() }
  })

  it('clears previous scores on partial and empty assessments and can restore a complete chart', () => {
    const dimensions = assessedDimensions()
    const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 360 })
    const values = () => (chart.getOption().series as { data: { value: number[] }[] }[])[0]!.data
    try {
      chart.setOption(buildRadarOption(dimensions), { notMerge: true })
      expect(values()[0]!.value).toEqual([71, 52, 64, 59, 66])
      dimensions.technical = { status: 'insufficient', score: null, reason: '尚未讨论。', references: [] }
      chart.setOption(buildRadarOption(dimensions), { notMerge: true })
      expect(values()).toEqual([])
      for (const id of reportDimensionIds) dimensions[id] = { status: 'insufficient', score: null, reason: '尚未讨论。', references: [] }
      chart.setOption(buildRadarOption(dimensions), { notMerge: true })
      expect(values()).toEqual([])
      const complete = assessedDimensions()
      complete.logic.score = 0
      chart.setOption(buildRadarOption(complete), { notMerge: true })
      expect(values()[0]!.value).toEqual([0, 52, 64, 59, 66])
    } finally { chart.dispose() }
  })

  it('preserves old saved scores and labels them as legacy without inventing observation coverage', () => {
    const dimensions = Object.fromEntries(reportDimensionIds.map(id => {
      const dimension = assessedDimensions()[id]
      return [id, { score: dimension.score!, reason: dimension.reason, references: dimension.references }]
    })) as Parameters<typeof buildRadarOption>[0]
    const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 360 })
    try {
      chart.setOption(buildRadarOption(dimensions), { notMerge: true })
      const data = (chart.getOption().series as { data: { name: string; value: number[] }[] }[])[0]!.data[0]!
      expect(data.value).toEqual([71, 52, 64, 59, 66])
      expect(data.name).toBe('旧版保存评分')
      expect((chart.getOption().aria as { description: string }).description).toContain('观察覆盖未标注')
    } finally { chart.dispose() }
  })
})
