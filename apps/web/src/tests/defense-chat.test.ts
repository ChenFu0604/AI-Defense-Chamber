import { describe, expect, it } from 'vitest'
import { createSSRApp, effectScope, h, nextTick, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { useDefenseStore } from '../stores/defense'
import { useConversationScroll } from '../composables/useConversationScroll'
import { isAnswerShortcut } from '../utils/defense-chat'
import DefenseChatComposer from '../components/defense/DefenseChatComposer.vue'
import DefenseMessages from '../components/defense/DefenseMessages.vue'
import DefenseProgressMenu from '../components/defense/DefenseProgressMenu.vue'
import { endedReportSession } from '../../../../tests/fixtures/report'

describe('chat answer composition', () => {
  it('shows actual session counts in a compact progress popover with bounded remaining questions', async () => {
    const session = endedReportSession()
    const render = (questions: number, limit: number) => renderToString(createSSRApp(DefenseProgressMenu,
      { session, questions, limit, busy: false }))
    const html = await render(3, 30)
    expect(html).toContain('popover="auto"')
    expect(html).toContain('popovertarget=')
    expect(html).toContain('剩余 27 题')
    expect(html).toContain('<dd>1 次</dd>')
    expect(html).toContain('<dd>已结束</dd>')
    expect(html).not.toMatch(/tokens|tokens\/s|生成速度/i)
    expect(await render(99, 5)).toContain('剩余 0 题')
    expect(await render(-2, 5)).toContain('剩余 5 题')
  })
  it('sends on Enter, uses Shift+Enter for newlines and never submits an IME confirmation', () => {
    const event = { key: 'Enter', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, isComposing: false, repeat: false }
    expect(isAnswerShortcut(event)).toBe(true)
    expect(isAnswerShortcut({ ...event, ctrlKey: true })).toBe(true)
    expect(isAnswerShortcut({ ...event, metaKey: true })).toBe(true)
    for (const changed of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { shiftKey: true }, { altKey: true }, { key: 'a' }]) {
      expect(isAnswerShortcut({ ...event, ctrlKey: true, ...changed })).toBe(false)
    }
  })

  it('preserves a failed answer draft and disables sending until the pending operation is resolved', async () => {
    const pinia = createPinia(), store = useDefenseStore(pinia), session = endedReportSession()
    session.status = 'awaiting_answer'
    store.session = session
    const render = () => renderToString(createSSRApp({ render: () => h(DefenseChatComposer,
      { blocked: false, questions: 1, limit: 5, helpRecords: [] }) }).use(pinia))
    const submit = (html: string) => /<button\b[^>]*type="submit"[^>]*>/.exec(html)?.[0]
    expect(submit(await render())).toContain('disabled')
    store.draft = '我会补充原始访谈记录。'
    expect(submit(await render())).not.toContain('disabled')
    const ready = await render()
    expect(ready.match(/<dialog\b/g)).toHaveLength(3)
    expect(ready).not.toContain('class="chat-compose-extras"')
    const dialogBody = ready.slice(ready.indexOf('<dialog'))
    expect(dialogBody).toContain('OCR 识别扫描件和图片文字')
    expect(dialogBody).toContain('提示不会替你提交回答')
    expect(ready.indexOf('<form')).toBeLessThan(ready.indexOf('<dialog'))
    store.operation = { kind: 'answer', body: { requestId: crypto.randomUUID(), questionId: session.currentQuestionId!, answer: store.draft } }
    const failed = await render()
    expect(failed).toContain(store.draft)
    expect(failed).toContain('重试上次操作')
    expect(failed).toMatch(/<textarea\b[^>]*disabled/)
    expect(submit(failed)).toBeUndefined()
    store.operation = null
    store.busy = true
    expect(submit(await render())).toContain('disabled')
  })

  it('keeps actual answer anchors, role identities and current question in one message stream', async () => {
    const session = endedReportSession(), first = session.messages[0]!, answer = session.messages[1]!
    const followup = { ...first, id: crypto.randomUUID(), status: 'sent' as const, content: '怎样核对这些访谈记录？',
      replyTo: answer.id, assessment: { answerQuote: answer.content, evaluation: 'evidence_missing' as const,
        feedback: '验证计划清楚，但目前还缺少原始访谈记录。', nextStrategy: 'probe_evidence' as const, risks: [] } }
    session.messages.push(followup)
    const html = await renderToString(createSSRApp(DefenseMessages, { messages: session.messages,
      demo: false, variant: 'chat', currentQuestionId: followup.id }))
    expect(html.indexOf(answer.content)).toBeLessThan(html.indexOf(followup.assessment.feedback))
    expect(html.indexOf(followup.assessment.feedback)).toBeLessThan(html.indexOf(followup.content))
    expect(html).toContain(`id="answer-${answer.id}"`)
    expect(html).toContain('id="session-question"')
    expect(html).toContain('商业评委')
    expect(html.match(/aria-label="当前问题"/g)).toHaveLength(1)
    expect(html.split(followup.content)).toHaveLength(2)
  })
})

describe('conversation scrolling', () => {
  it('follows new messages until the reader scrolls up and exposes an explicit jump back', async () => {
    const scope = effectScope(), revision = ref(0)
    const feed = ref({ scrollHeight: 1000, scrollTop: 0, clientHeight: 400 } as HTMLElement)
    const ui = scope.run(() => useConversationScroll(feed, () => revision.value))!
    try {
      await nextTick()
      expect(feed.value.scrollTop).toBe(1000)
      feed.value.scrollTop = 100
      ui.onScroll()
      expect(ui.following.value).toBe(false)
      revision.value++
      await nextTick(); await nextTick()
      expect(feed.value.scrollTop).toBe(100)
      expect(ui.unread.value).toBe(true)
      ui.jumpToLatest()
      expect(feed.value.scrollTop).toBe(1000)
      expect(ui.unread.value).toBe(false)
      Object.defineProperty(feed.value, 'scrollHeight', { value: 1400, configurable: true })
      revision.value++
      await nextTick(); await nextTick()
      expect(feed.value.scrollTop).toBe(1400)
    } finally { scope.stop() }
  })
})
