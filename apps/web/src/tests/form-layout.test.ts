import { readFileSync } from 'node:fs'
import { parse, type Rule } from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import ProjectForm from '../components/ProjectForm.vue'
import { fixtureProject, MemoryStorage } from './project-fixtures'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const surfaces = parse(source('../styles/clean-workspace.css'))
const layout = parse(source('../styles/project-layout.css'))
const declarations = (rule: Rule) => Object.fromEntries(rule.nodes
  .filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
function rule(root: ReturnType<typeof parse>, selector: string) {
  const result = root.nodes.filter((node): node is Rule => node.type === 'rule' && node.selector === selector).at(-1)
  if (!result) throw new Error('Missing layout rule: ' + selector)
  return result
}
function luminance(hex: string) {
  const rgb = hex.match(/[a-f\d]{2}/gi)!.map(value => {
    const channel = parseInt(value, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
}
afterEach(() => vi.unstubAllGlobals())

describe('project form surfaces and compact header', () => {
  it('defines a visible input boundary scoped above the legacy form-field rules', () => {
    const controls: Rule[] = []
    surfaces.walkRules(candidate => {
      if (candidate.selector.startsWith(':is(.project-form, .model-config-form) .form-field :is(input:not([type])')) controls.push(candidate)
    })
    const base = controls.find(candidate => candidate.selector.endsWith('textarea, select)'))!
    expect(base).toBeDefined()
    const appearance = declarations(base), border = appearance.border!.match(/#[a-f\d]{6}/i)?.[0]
    expect(appearance.border).toMatch(/^1px solid /)
    expect(appearance.background).toBe('var(--surface-subtle)')
    // The border identifies the input even where the pale fill is hard to see.
    expect((1.05) / (luminance(border!) + 0.05)).toBeGreaterThanOrEqual(3)
    expect(base.selector).not.toMatch(/type='(?:checkbox|radio|file|button)'|chat-compose/)
    const hover = controls.find(candidate => candidate.selector.includes(':hover'))!
    expect(hover.selector).toContain(":not([aria-invalid='true'])")
    expect(controls.some(candidate => candidate.selector.endsWith(':disabled'))).toBe(true)
    const error = controls.find(candidate => candidate.selector.endsWith("[aria-invalid='true']"))!
    expect(declarations(error)['border-color']).toBe('var(--danger)')
  })

  it('wraps the header naturally and keeps draft and materials spacing compact', () => {
    expect(declarations(rule(layout, '.project-form .form-panel-heading'))).toMatchObject({display: 'flex', 'flex-wrap': 'wrap', 'padding-bottom': '0'})
    expect(declarations(rule(layout, '.project-form .project-form-heading-actions'))['margin-top']).toBe('0')
    expect(declarations(rule(layout, '.project-form > .draft-status'))).toMatchObject({margin: '12px 0', padding: '0'})
    expect(declarations(rule(layout, '.project-form > .project-materials'))['margin']).toBe('0 0 18px')
  })

  it('aligns the basic input and selector on the same shared row with equal heights', () => {
    expect(declarations(rule(layout, '.project-basic-fields')).gap).toBe('0 20px')
    const controls = declarations(rule(layout, '.project-form .project-basic-fields .form-field > :is(input, select)'))
    expect(controls).toMatchObject({'grid-row': '3', 'margin-top': '0'})
    expect(controls.height).toBe(controls['min-height'])
    expect(controls.height).toBe('50px')
    expect(declarations(rule(layout, '.project-basic-fields .form-field > .field-hint'))['grid-row']).toBe('2')
    expect(source('../styles/project-layout.css')).toContain('grid-template-rows: subgrid')
  })

  it('retains edit content, draft saving and document import ahead of the fields', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const project = fixtureProject()
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: ProjectForm, props: {project}}]})
    await router.push('/')
    const html = await renderToString(createSSRApp({render: () => h(RouterView)}).use(createPinia()).use(router))
    expect(html).toContain('修改项目，保留每次进步')
    for (const action of ['导入项目文档', '载入示例', '保存草稿']) expect(html).toContain(action)
    expect(html).toContain(project.description)
    expect(html).toContain(project.targetUsers)
    expect(html.indexOf('class="draft-status"')).toBeLessThan(html.indexOf('id="project-form-materials"'))
    expect(html.indexOf('id="project-form-materials"')).toBeLessThan(html.indexOf('id="project-name"'))
    expect(html).toContain('id="project-description"')
    expect(html).toContain('id="project-projectType-hint"')
    expect(html).toContain('aria-describedby="project-projectType-hint"')
    expect(html).toContain('class="field-counter"')
  })
})
