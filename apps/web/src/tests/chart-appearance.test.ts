import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { init } from 'echarts/core'
import { buildRiskGraph } from '@defense/shared'
import {
  defaultChartPalette,
  observeChartAppearance,
  prefersReducedChartMotion,
  readChartPalette,
} from '../components/chart-theme'
import { buildRadarOption } from '../components/report/radar-chart'
import { buildFlowElements } from '../components/risk/risk-layout'
import { endedReportSession, reportFixture, reportOutputFixture } from '../../../../tests/fixtures/report'

afterEach(() => vi.unstubAllGlobals())

describe('chart appearance', () => {
  it('keeps server-rendered chart colors aligned with the production workspace tokens', () => {
    const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
    for (const [key, token] of Object.entries({
      label: 'label', grid: 'grid', area: 'area', surface: 'surface', fill: 'fill',
      line: 'line', edge: 'edge', edgeLabelBackground: 'edge-label-bg',
    })) {
      const actual = new RegExp(`--chart-${token}:\\s*([^;]+);`).exec(css)?.[1]?.trim()
      expect(defaultChartPalette[key as keyof typeof defaultChartPalette], token).toBe(actual)
    }
  })

  it('reads workspace tokens and cleans up motion listeners', () => {
    const root = {}
    const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    let text = '#0b5077'
    vi.stubGlobal('document', { documentElement: root })
    vi.stubGlobal('window', { matchMedia: vi.fn(() => media) })
    vi.stubGlobal('getComputedStyle', vi.fn(() => ({
      getPropertyValue: (name: string) => name === '--chart-label' ? text : '',
    })))
    const update = vi.fn(() => readChartPalette())
    const stop = observeChartAppearance(update)
    expect(readChartPalette().label).toBe('#0b5077')
    expect(prefersReducedChartMotion()).toBe(true)
    text = '#073652'
    update()
    expect(readChartPalette().label).toBe(text)
    expect(media.addEventListener).toHaveBeenCalledWith('change', update)
    stop()
    expect(media.removeEventListener).toHaveBeenCalledWith('change', update)
  })

  it('updates SVG palette without changing report scores and disables motion when requested', () => {
    const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 600, height: 360 })
    const dimensions = reportOutputFixture().dimensions
    const glass = {
      ...defaultChartPalette,
      label: '#073652', surface: '#e0f2fe', area: '#edf8fe', grid: '#a9d7e9',
      line: '#0369a1', fill: 'rgba(14,165,233,0.2)',
    }
    try {
      chart.setOption(buildRadarOption(dimensions, defaultChartPalette, true))
      const values = (chart.getOption().series as { data: { value: number[] }[] }[])[0]!.data[0]!.value
      chart.setOption(buildRadarOption(dimensions, glass, true), { notMerge: true })
      expect(chart.renderToSVGString()).toContain('#073652')
      expect(chart.renderToSVGString()).toContain('#e0f2fe')
      expect((chart.getOption().series as { data: { value: number[] }[] }[])[0]!.data[0]!.value).toEqual(values)
      expect(chart.getOption().animation).toBe(false)
    } finally {
      chart.dispose()
    }
  })

  it('restyles risk edges without inventing relationships or changing node layout', () => {
    const session = endedReportSession()
    const graph = buildRiskGraph({ project: session.project, analysis: session.analysis, session, report: reportFixture() })
    const original = buildFlowElements(graph)
    const glass = buildFlowElements(graph, null, {
      ...defaultChartPalette, label: '#073652', edge: '#386984', edgeLabelBackground: '#e0f2fe',
    })
    expect(glass.nodes).toEqual(original.nodes)
    expect(glass.edges.length).toBeGreaterThan(0)
    for (const edge of glass.edges) {
      const previous = original.edges.find((item) => item.id === edge.id)!
      expect([edge.id, edge.source, edge.target, edge.data]).toEqual([
        previous.id, previous.source, previous.target, previous.data,
      ])
      expect(edge.labelStyle).toMatchObject({ fill: '#073652' })
      expect(edge.labelBgStyle).toMatchObject({ fill: '#e0f2fe' })
    }
  })
})
