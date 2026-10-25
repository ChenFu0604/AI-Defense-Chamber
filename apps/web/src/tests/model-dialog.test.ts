import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, ref, type Ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { TrainingPreferences } from '@defense/shared'
import DefenseStartPanel from '../components/defense/DefenseStartPanel.vue'
import ModelSettingsDialog from '../components/settings/ModelSettingsDialog.vue'
import { analysisProject } from '../../../../tests/fixtures/analysis'
import { DEFENSE_RECENT_KEY } from '../services/defense-storage'
import { MemoryStorage } from './project-fixtures'

const preparation = vi.hoisted(() => ({ value: null as unknown as {
  mode: Ref<'live' | 'demo'>; judgeId: Ref<'business' | 'technical' | 'user' | 'devil'>;
  preferences: Ref<TrainingPreferences>; confirmed: Ref<boolean>;
  state: Ref<{ status: string; warning: string }>; analysis: Ref<null>; busy: Ref<boolean>; error: Ref<string>;
  start: ReturnType<typeof vi.fn>;
} }))
vi.mock('../composables/useTrainingPreparation', () => ({ useTrainingPreparation: () => preparation.value }))

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  preparation.value = { mode: ref('live'), judgeId: ref('technical'),
    preferences: ref({style: 'rehearsal', goal: 'technical', questionLimit: 10}), confirmed: ref(true),
    state: ref({status: 'idle', warning: ''}), analysis: ref(null), busy: ref(false), error: ref(''), start: vi.fn() }
})
afterEach(() => vi.unstubAllGlobals())

async function renderPreparation() {
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/defense', component: {render: () => h('div')}},
    {path: '/defense/sessions/:id', name: 'defense-session', component: {render: () => h('div')}},
    {path: '/history', name: 'history', component: {render: () => h('div')}},
  ]})
  await router.push('/defense?project=' + analysisProject.id)
  return renderToString(createSSRApp(DefenseStartPanel, {project: analysisProject}).use(createPinia()).use(router))
}

describe('training model settings modal presentation', () => {
  it('keeps the closed dialog named but leaves model inputs out of the preparation page', async () => {
    const html = await renderToString(createSSRApp(ModelSettingsDialog, {modelValue: false}).use(createPinia()))
    expect(html).toContain('<dialog')
    expect(html).toContain('关闭配置或检查模型')
    expect(html).toContain('aria-labelledby=')
    expect(html).not.toContain('id="model-base-url"')
    expect(html).not.toContain('model-config-card')
  })

  it('renders the real model form inside the named dialog with a return action and no duplicate heading', async () => {
    const html = await renderToString(createSSRApp(ModelSettingsDialog, {modelValue: true}).use(createPinia()))
    const bodyStart = html.indexOf('app-dialog-body'), bodyEnd = html.indexOf('app-dialog-footer')
    const formStart = html.indexOf('id="model-base-url"')
    expect(formStart).toBeGreaterThan(bodyStart)
    expect(formStart).toBeLessThan(bodyEnd)
    expect(html).toContain('获取模型'); expect(html).toContain('测试连接'); expect(html).toContain('保存到后端')
    expect(html).toContain('返回训练准备'); expect(html).toContain('model-config-embedded')
    expect(html).not.toContain('id="model-config-title"')
    expect(html).toContain('aria-label="模型连接设置"')
    expect(html).toContain('type="password"')
  })

  it('connects the trigger to its dialog and retains training choices and existing session links', async () => {
    const id = '99999999-9999-4999-8999-999999999999'
    localStorage.setItem(DEFENSE_RECENT_KEY, JSON.stringify([{id, projectId: analysisProject.id, name: analysisProject.name, mode: 'live'}]))
    const html = await renderPreparation()
    const control = html.match(/aria-controls="([^"]+-model-settings)"/)?.[1]
    expect(control).toBeTruthy()
    expect(html).toContain('id="' + control + '"')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('id="model-base-url"')
    expect(html).toContain('继续已有会话')
    expect(html).toContain('/defense/sessions/' + id)
    expect(html).toContain(analysisProject.name)
    expect(preparation.value.judgeId.value).toBe('technical')
    expect(preparation.value.preferences.value).toEqual({style: 'rehearsal', goal: 'technical', questionLimit: 10})
    expect(preparation.value.confirmed.value).toBe(true)
    expect(preparation.value.start).not.toHaveBeenCalled()
  })
})
