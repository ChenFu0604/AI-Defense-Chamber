import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import WorkspaceLayout from '../layouts/WorkspaceLayout.vue'
import { useProjectsStore } from '../stores/projects'
import { fixtureProject } from './project-fixtures'
import { buildRadarOption } from '../components/report/radar-chart'
import { buildFlowElements } from '../components/risk/risk-layout'
import { buildRiskGraph } from '@defense/shared'
import { endedReportSession, reportFixture, reportOutputFixture } from '../../../../tests/fixtures/report'

async function renderPage(component: Component, path = '/', populated = false, archived = false) {
  const placeholder = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: placeholder },
      { path: '/projects', name: 'projects', component: placeholder },
      { path: '/projects/new', name: 'project-create', component: placeholder },
      { path: '/projects/:id', name: 'project-detail', component: placeholder },
      { path: '/defense', name: 'defense', component: placeholder },
      { path: '/defense/sessions/:id', name: 'defense-session', component: placeholder },
      { path: '/defense/sessions/:id/report', name: 'defense-report', component: placeholder },
      { path: '/history', name: 'history', component: placeholder },
      { path: '/tasks', name: 'improvement-tasks', component: placeholder },
      { path: '/settings', name: 'system-settings', component: placeholder },
    ],
  })
  const pinia = createPinia()
  const projects = useProjectsStore(pinia)
  projects.loaded = true
  if (populated) projects.projects = [fixtureProject()]
  if (archived) projects.archivedIds = [fixtureProject().id]
  const app = createSSRApp({ render: () => h(component) }).use(pinia).use(router)
  await router.push(path)
  await router.isReady()
  return renderToString(app)
}

function links(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
    attributes: match[1]!,
    href: /\bhref="([^"]*)"/.exec(match[1]!)?.[1],
    text: match[2]!.replace(/<[^>]*>/g, '').trim(),
  }))
}

// Read the production tokens so accessibility regressions cannot pass by copying old colors here.
const tokens = Object.fromEntries(
  [...readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
    .matchAll(/--([\w-]+):\s*(#[\da-f]{6}(?:[\da-f]{2})?)\s*;/gi)]
    .map((match) => [match[1]!, match[2]!]),
)

function color(name: string) {
  const value = tokens[name]
  if (!value) throw new Error(`Missing production color token: ${name}`)
  return value
}

function composite(hex: string, backdrop = color('page-bg')) {
  if (!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(hex)) throw new Error(`Unsupported color: ${hex}`)
  const alpha = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1
  return [1, 3, 5].map(start => (parseInt(hex.slice(start, start + 2), 16) * alpha + parseInt(backdrop.slice(start, start + 2), 16) * (1 - alpha)) / 255)
}

function luminance(hex: string) {
  const channels = composite(hex).map((channel) => {
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)]
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05)
}

describe('clean blue workspace navigation', () => {
  it('removes the global topbar only in the conversation and preserves report navigation', async () => {
    const session = await renderPage(WorkspaceLayout, '/defense/sessions/test-session')
    expect(session).toContain('conversation-layout')
    expect(session).not.toContain('class="topbar')
    expect(session).not.toContain('class="page-footer')
    expect(session).toContain('aria-label="主导航"')
    expect(session).toContain('href="/settings"')
    const report = await renderPage(WorkspaceLayout, '/defense/sessions/test-session/report')
    expect(report).not.toContain('conversation-layout')
    expect(report).toContain('class="topbar')
  })
  it('keeps the navigation on simple surfaces without obsolete scenery or theme controls', async () => {
    const html = await renderPage(WorkspaceLayout)
    expect(html).not.toMatch(/aero-scenery|aero-decor|aero-panel/)
    expect(html).toMatch(/class="sidebar surface-panel\b/)
    expect(html).toMatch(/class="topbar surface-panel\b/)
    expect(html).not.toContain('aria-label="界面主题"')
    expect(html).not.toContain('深色模式')
  })
  it('keeps real creation/training entry points and explains the flow without a fabricated live session', async () => {
    const html = await renderPage(HomeView)
    const anchors = links(html)
    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/projects/new', text: '创建项目' }),
      expect.objectContaining({ href: '/defense', text: '开始答辩' }),
    ]))
    const preview = /<aside\b[^>]*aria-label="训练流程说明"[^>]*>([\s\S]*?)<\/aside>/.exec(html)?.[1]
    expect(preview).toBeDefined()
    expect(preview!.match(/<li>/g)).toHaveLength(3)
    for (const step of ['整理项目资料', '和评委聊一聊', '找到改进方向']) expect(preview).toContain(step)
    expect(preview).toContain('AI 反馈是训练建议')
    expect(preview).not.toMatch(/role="(?:log|progressbar)"|正在(?:分析|生成)|综合评分|已完成 \d+ 次/)
    expect(html).toContain('创建第一个项目')
    expect(html).not.toMatch(/class="[^"]*\bproject-card\b/)
  })

  it('renders the saved project and its actual detail link instead of the empty state', async () => {
    const html = await renderPage(HomeView, '/', true)
    const project = fixtureProject()
    expect(links(html)).toContainEqual(expect.objectContaining({
      href: `/projects/${project.id}`, text: project.name,
    }))
    expect(html).toContain(project.description)
    expect(html).not.toContain('创建第一个项目')
  })

  it('shows an actionable empty state when all projects are archived', async () => {
    const html = await renderPage(HomeView, '/', true, true)
    expect(html).toContain('项目都已归档')
    expect(html).toContain('最近的项目<span>00</span>')
    expect(html).not.toMatch(/class="[^"]*\bproject-card\b/)
    expect(links(html)).toContainEqual(expect.objectContaining({ href: '/projects', text: '查看全部项目与草稿 →' }))
  })

  it.each([
    ['/', '总览'], ['/projects', '我的项目'], ['/defense', '答辩准备'], ['/history', '历史记录'],
  ])('keeps the core navigation available and marks %s as current', async (path, label) => {
    const html = await renderPage(WorkspaceLayout, path)
    const navigation = /<nav\b[^>]*aria-label="主导航"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1]
    expect(navigation).toBeDefined()
    const navigationLinks = links(navigation!)
    for (const href of ['/', '/projects', '/defense', '/history']) {
      expect(navigationLinks).toContainEqual(expect.objectContaining({ href }))
    }
    const current = navigationLinks.find((link) => link.href === path)
    expect(current?.text).toBe(label)
    expect(current?.attributes).toContain('aria-current="page"')
    expect(links(html)).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: '/projects/new', text: '创建项目' }),
      expect.objectContaining({ href: '/settings', text: '系统设置' }),
      expect.objectContaining({ href: '#main-content', text: '跳到主要内容' }),
    ]))
    expect(html).not.toMatch(/开发说明|本地开发版|PHASE 09|阶段 09/)
  })
})

describe('clean blue text accessibility', () => {
  it('keeps primary and secondary text readable on opaque workspace surfaces', () => {
    for (const foreground of ['text-primary', 'text-secondary', 'muted']) {
      for (const background of ['page-bg', 'surface-card', 'surface-subtle', 'accent-soft']) {
        expect(contrast(color(foreground), color(background)), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    for (const surface of ['page-bg', 'surface-card', 'surface-subtle', 'surface-elevated']) {
      expect(color(surface)).toMatch(/^#[\da-f]{6}$/i)
    }
    expect(color('page-bg')).not.toBe(color('surface-card'))
    expect(color('surface-card')).toBe('#ffffff')
  })

  it('keeps buttons, status notices and role labels readable without relying on pale text', () => {
    for (const [foreground, background] of [
      ['accent-contrast', 'accent'], ['accent-contrast', 'accent-hover'],
      ['accent', 'accent-soft'], ['success', 'success-soft'],
      ['warning', 'warning-soft'], ['danger', 'danger-soft'],
      ...['mint', 'cyan', 'violet', 'rose'].map((role) => [role, 'surface-card']),
    ]) {
      expect(contrast(color(foreground!), color(background!)), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
    }
    for (const foreground of ['success', 'warning', 'danger', 'mint', 'cyan', 'violet', 'rose']) {
      expect(contrast(color(foreground), color('surface-subtle')), `${foreground} on secondary surface`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps actual radar scores and risk relationships legible on light chart surfaces', () => {
    const dimensions = reportOutputFixture().dimensions
    const option = buildRadarOption(dimensions)
    const radar = option.radar as { axisName: { color: string }; splitArea: { areaStyle: { color: string[] } } }
    for (const background of radar.splitArea.areaStyle.color) {
      expect(luminance(background)).toBeGreaterThan(0.85)
      expect(contrast(radar.axisName.color, background)).toBeGreaterThanOrEqual(4.5)
    }
    const series = option.series as { data: { value: number[] }[] }[]
    expect(series[0]!.data[0]!.value).toEqual([71, 52, 64, 59, 66])
    const session = endedReportSession()
    const graph = buildRiskGraph({ project: session.project, analysis: session.analysis, session, report: reportFixture() })
    const flow = buildFlowElements(graph)
    expect(flow.edges.length).toBeGreaterThan(0)
    for (const edge of flow.edges) {
      const foreground = (edge.labelStyle as { fill: string }).fill
      const background = (edge.labelBgStyle as { fill: string }).fill
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
      expect(edge.data).toEqual(graph.edges.find((source) => source.id === edge.id))
    }
  })
})
