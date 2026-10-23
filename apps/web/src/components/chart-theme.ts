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

// Server-rendered options use the same neutral blue palette as the workspace.
export const defaultChartPalette: ChartPalette = {
  label: '#5c687b',
  grid: '#dce3ee',
  area: '#f6f8fb',
  surface: '#ffffff',
  fill: 'rgb(55 102 213 / 12%)',
  line: '#3766d5',
  edge: '#61718a',
  edgeLabelBackground: '#ffffff',
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
