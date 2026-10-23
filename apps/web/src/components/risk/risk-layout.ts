import type { Node, Edge } from '@vue-flow/core'
import { riskGraphSchema, type RiskGraph, type RiskNode } from '@defense/shared'
import { readChartPalette, type ChartPalette } from '../chart-theme'

export function buildFlowElements(
  input: RiskGraph,
  selectedId: string | null = null,
  palette: ChartPalette = readChartPalette(),
) {
  const graph = riskGraphSchema.parse(input)
  const order = { high: 0, medium: 1, low: 2 }
  const sorted = [...graph.nodes].sort(
    (a, b) => order[a.level] - order[b.level] || a.id.localeCompare(b.id),
  )
  const nodes: (Node<RiskNode> & { selected: boolean })[] = sorted.map((node, index) => ({
    id: node.id,
    type: 'risk',
    data: node,
    position: { x: (index % 3) * 350, y: Math.floor(index / 3) * 210 },
    selected: node.id === selectedId,
    draggable: true,
    selectable: true,
    connectable: false,
    deletable: false,
    focusable: true,
    ariaLabel: `${node.name}，${node.level === 'high' ? '高' : node.level === 'medium' ? '中' : '低'}风险`,
  }))
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    label: '共同依据',
    data: edge,
    style: { stroke: palette.edge, strokeWidth: 1.5, strokeDasharray: '5 4' },
    labelStyle: { fill: palette.label, fontSize: 12 },
    labelBgStyle: { fill: palette.edgeLabelBackground },
    animated: false,
    deletable: false,
    focusable: true,
  }))
  return { nodes, edges }
}
