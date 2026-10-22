import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import DiscussionBoard from '../components/defense/DiscussionBoard.vue'
import DiscussionSummary from '../components/defense/DiscussionSummary.vue'
import { withDiscussion } from '../../../../tests/fixtures/discussion'
import { endedReportSession } from '../../../../tests/fixtures/report'
const render = (component: Parameters<typeof h>[0], props: Record<string, unknown>) => renderToString(createSSRApp({render: () => h(component, props)}))

describe('saved discussion UI', () => {
  it('renders actual sources, quotes and correction controls; historical mode has no editing actions', async () => {
    const session = withDiscussion(endedReportSession()), topic = session.discussion!.topics[0]!, answer = session.messages.find(m => m.sender === 'user')!
    session.status = 'awaiting_answer'
    topic.status = 'awaiting_evidence'; topic.source = 'user'; topic.note = '先观察一次实际使用，再补记录。'
    topic.observations.push({answerId: answer.id, questionId: answer.replyTo!, quote: answer.content.slice(0, 40), summary: '实际回答尚需材料支持。'})
    const html = await render(DiscussionBoard, {session})
    expect(html).toContain('待补证据')
    expect(html).toContain('用户更正')
    expect(html).toContain('先观察一次实际使用，再补记录。')
    expect(html).toContain('href="#answer-' + answer.id + '"')
    expect(html).toContain(answer.content.slice(0, 40))
    expect(html).toContain('更正状态')
    const history = await render(DiscussionBoard, {session, readOnly: true})
    expect(history).not.toContain('<button')
    expect(history).not.toContain('<form')
    expect(history).toContain('实际回答尚需材料支持。')
  })
  it('shows uncovered and unevaluated work from saved data and keeps legacy UI empty', async () => {
    const session = withDiscussion(endedReportSession())
    session.discussion!.topics[0]!.status = 'paused'
    const summary = await render(DiscussionSummary, {session})
    expect(summary).toContain('本场尚未覆盖 · 3')
    expect(summary).toContain('次已保存回答尚未完成逐轮评价')
    expect(summary).toContain('不重新调用模型')
    const legacy = endedReportSession()
    expect(await render(DiscussionBoard, {session: legacy})).not.toContain('<section')
    expect(await render(DiscussionSummary, {session: legacy})).not.toContain('<section')
  })
})
