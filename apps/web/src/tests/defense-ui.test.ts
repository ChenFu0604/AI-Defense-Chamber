import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import JudgeRolePicker from '../components/judges/JudgeRolePicker.vue'
import DefenseModePicker from '../components/defense/DefenseModePicker.vue'
import DefenseSessionStatus from '../components/defense/DefenseSessionStatus.vue'
import DefenseMessages from '../components/defense/DefenseMessages.vue'
const render = (component: Parameters<typeof h>[0], props: Record<string, unknown>) =>
  renderToString(createSSRApp({ render: () => h(component, props) }))
describe('defense workspace visual states', () => {
  it('renders four actual roles, one selection, dimensions and a disabled fieldset during requests', async () => {
    const html = await render(JudgeRolePicker, { modelValue: 'technical', disabled: true })
    expect(html.match(/type="radio"/g)).toHaveLength(4)
    expect(html.match(/ checked/g)).toHaveLength(1)
    expect(html).toContain('value="technical"')
    expect(html).toMatch(/<fieldset\b[^>]*\bdisabled(?:\s|>)/)
    expect(html).toContain('技术可行性')
    expect(html).toContain('已选为首位评委')
  })
  it('keeps the current role explicit during dialogue and uses distinct native groups', async () => {
    const html = await render(JudgeRolePicker, { modelValue: 'devil', active: true })
    expect(html).toContain('当前评委')
    expect(html).toContain('切换至此评委')
    expect(html).toContain('魔鬼评委')
    const modes = await render(DefenseModePicker, { modelValue: 'demo', label: '提问来源' })
    expect(modes.match(/type="radio"/g)).toHaveLength(2)
    expect(modes).toContain('<legend>提问来源</legend>')
    expect(modes).toContain('不调用模型、不生成真实评分')
  })
  it('uses real question counts, clamps display bounds and does not imply a score or completion rate', async () => {
    const html = await render(DefenseSessionStatus, {
      mode: 'live',
      status: 'awaiting_answer',
      questions: 3,
      answers: 2,
    })
    expect(html).toContain('aria-valuenow="3"')
    expect(html).toContain('width:10%')
    expect(html).toContain('已保存 2 次回答')
    expect(html).toContain('不是评分或完成率')
    const ended = await render(DefenseSessionStatus, {
      mode: 'demo',
      status: 'ended',
      questions: 99,
      answers: 4,
    })
    expect(ended).toContain('aria-valuenow="30"')
    expect(ended).toContain('模拟演示 · 未调用模型')
  })
  it('places the first-question activity inside the conversation and removes it when idle', async () => {
    const pending = await render(DefenseMessages, {
      messages: [],
      demo: false,
      activity: 'generating',
      judgeId: 'technical',
    })
    expect(pending).toContain('技术评委正在准备首问')
    expect(pending).toContain('aria-busy="true"')
    expect(pending).not.toContain('正在处理请求')
    const idle = await render(DefenseMessages, { messages: [], demo: false })
    expect(idle).toContain('对话，即将开始')
    expect(idle).not.toContain('class="defense-activity"')
    const demo = await render(DefenseMessages, {
      messages: [],
      demo: true,
      activity: 'generating',
      judgeId: 'user',
    })
    expect(demo).toContain('正在准备模拟模板，不调用真实模型')
  })
})
