import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, effectScope, h, nextTick, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useRequestElapsed } from '../composables/useRequestElapsed'
import DefenseMessages from '../components/defense/DefenseMessages.vue'
import { useEndDefense } from '../composables/useEndDefense'
import { useDiscussionEditor } from '../composables/useDiscussionEditor'
import DefenseSessionView from '../views/DefenseSessionView.vue'
import { useDefenseStore } from '../stores/defense'
import { endedReportSession } from '../../../../tests/fixtures/report'
import { withDiscussion } from '../../../../tests/fixtures/discussion'
import type { TopicStateRequest } from '@defense/shared'

const cleanups: (()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).forEach(f=>f());vi.restoreAllMocks();vi.useRealTimers()})
describe('user-facing defense flow',()=>{
  it('requires explicit confirmation and blocks ending during another request',async()=>{
    const end=vi.fn(), disabled=ref(false), scope=effectScope()
    cleanups.push(()=>scope.stop())
    const ui=scope.run(()=>useEndDefense(disabled,end))!
    ui.confirm();expect(end).not.toHaveBeenCalled()
    ui.request();expect(ui.confirming.value).toBe(true)
    ui.cancel();ui.confirm();expect(end).not.toHaveBeenCalled()
    ui.request();disabled.value=true;await nextTick()
    expect(ui.confirming.value).toBe(false);ui.confirm();expect(end).not.toHaveBeenCalled()
    disabled.value=false;ui.request();ui.confirm();expect(end).toHaveBeenCalledOnce()
  })
  it('preserves correction input through failure, closes after saved acknowledgement and rejects stale edits',async()=>{
    const session=ref(withDiscussion(endedReportSession())), update=vi.fn(), scope=effectScope()
    cleanups.push(()=>scope.stop())
    const ui=scope.run(()=>useDiscussionEditor(session,update))!
    ui.edit('needs');ui.save('needs');expect(update).not.toHaveBeenCalled()
    ui.note.value='先补充访谈记录';ui.save('needs')
    expect(ui.editing.value).toBe('needs');expect(ui.note.value).toBe('先补充访谈记录')
    const input=update.mock.calls[0]![0] as TopicStateRequest
    session.value.discussion!.edits.push({...input,requestId:crypto.randomUUID(),createdAt:new Date().toISOString()})
    session.value.discussion!.revision++;await nextTick()
    expect(ui.editing.value).toBeNull();expect(ui.savedMessage.value).toContain('已保存')
    ui.edit('value');ui.note.value='第二次更正';session.value.discussion!.revision++;await nextTick()
    ui.save('value');expect(update).toHaveBeenCalledTimes(1);expect(ui.error.value).toContain('已更新')
  })
  it('counts elapsed time, resets for a new request and clears timers on disposal',async()=>{
    vi.useFakeTimers();const scope=effectScope(), active=ref(true), key=ref('one')
    cleanups.push(()=>scope.stop())
    const seconds=scope.run(()=>useRequestElapsed(active,key))!
    vi.advanceTimersByTime(31000);expect(seconds.value).toBe(31)
    key.value='two';await nextTick();expect(seconds.value).toBe(0)
    vi.advanceTimersByTime(5000);expect(seconds.value).toBe(5)
    active.value=false;await nextTick();expect(seconds.value).toBe(0)
    active.value=true;await nextTick();scope.stop();expect(vi.getTimerCount()).toBe(0)
  })
  it('only offers a retry for the specific pending answer, not ended historical failures',async()=>{
    const session=endedReportSession(), answer=session.messages.find(m=>m.sender==='user')!
    answer.status='failed'
    const html=await renderToString(createSSRApp(DefenseMessages,{messages:session.messages,demo:false}))
    expect(html).toContain('逐轮评价未完成')
    expect(html).not.toContain('可重试')
    expect(html).not.toContain('重试上次操作')
    const pending=await renderToString(createSSRApp(DefenseMessages,{messages:session.messages,demo:false,retryableAnswerId:answer.id}))
    expect(pending).toContain('重试上次操作')
  })
  it('puts current question and answer before secondary controls, with an ended recap and readable draft',async()=>{
    const pinia=createPinia(), store=useDefenseStore(pinia), session=withDiscussion(endedReportSession())
    store.session=session;store.session.status='awaiting_answer';store.draft='尚未提交的真实草稿'
    vi.spyOn(store,'load').mockResolvedValue()
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/defense',component:{render:()=>h('div')}},{path:'/defense/sessions/:id/report',name:'defense-report',component:{render:()=>h('div')}},{path:'/defense/sessions/:id',component:DefenseSessionView}]})
    await router.push('/defense/sessions/'+session.id)
    const render=()=>renderToString(createSSRApp({render:()=>h(RouterView)}).use(pinia).use(router))
    const html=await render()
    expect(html.indexOf('aria-label="当前问题"')).toBeLessThan(html.indexOf('id="defense-answer"'))
    expect(html.indexOf('id="defense-answer"')).toBeLessThan(html.indexOf('切换评委 ·'))
    expect(html.indexOf('id="defense-answer"')).toBeLessThan(html.indexOf('aria-label="答辩消息记录"'))
    store.session.status='ended'
    const ended=await render()
    expect(ended).not.toContain('id="defense-answer"')
    expect(ended).not.toContain('aria-label="当前问题"')
    expect(ended).toContain('查看保留的回答草稿')
    expect(ended).toContain('尚未提交的真实草稿')
  })
})
