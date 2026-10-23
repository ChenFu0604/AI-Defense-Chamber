export interface ChartPalette {
  label: string
  grid: string
  area: string
  surface: string
  fill: string
  line: string
  edge: string
  edgeLabelBackground: string
}

// Server-rendered options use the same daylight palette as the workspace.
export const defaultChartPalette: ChartPalette = {
  label: '#0b5077',
  grid: '#a9d7e9',
  area: '#edf8fe',
  surface: '#f0f9ff',
  fill: 'rgb(14 165 233 / 20%)',
  line: '#0369a1',
  edge: '#386984',
  edgeLabelBackground: '#f0f9ff',
}

export function readChartPalette(element?: Element): ChartPalette {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return { ...defaultChartPalette }
  }
  const style = getComputedStyle(element ?? document.documentElement)
  const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    label: color('--chart-label', defaultChartPalette.label),
    grid: color('--chart-grid', defaultChartPalette.grid),
    area: color('--chart-area', defaultChartPalette.area),
    surface: color('--chart-surface', defaultChartPalette.surface),
    fill: color('--chart-fill', defaultChartPalette.fill),
    line: color('--chart-line', defaultChartPalette.line),
    edge: color('--chart-edge', defaultChartPalette.edge),
    edgeLabelBackground: color('--chart-edge-label-bg', defaultChartPalette.edgeLabelBackground),
  }
}

export function prefersReducedChartMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

/** Both charts respect motion preferences and release their browser listeners on unmount. */
export function observeChartAppearance(update: () => void) {
  const motion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : undefined
  motion?.addEventListener('change', update)
  return () => {
    motion?.removeEventListener('change', update)
  }
}
