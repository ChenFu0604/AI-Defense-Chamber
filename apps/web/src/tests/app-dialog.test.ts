import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, effectScope, h, nextTick, ref, shallowRef } from 'vue'
import { renderToString } from '@vue/server-renderer'
import AppDialog from '../components/ui/AppDialog.vue'
import { useNativeDialog } from '../composables/useNativeDialog'

describe('shared tool dialog', () => {
  it('keeps content mounted inside a named, initially closed dialog', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(AppDialog,
      { modelValue: false, title: '补充图片或文档', description: '关闭不取消正在处理的附件。' },
      { default: () => h('input', { value: '保留中的附件说明' }), footer: () => h('button', '返回回答') },
    ) }))
    expect(html).toMatch(/^<dialog\b/)
    expect(html).not.toMatch(/<dialog\b[^>]*\bopen(?:=|\s|>)/)
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('保留中的附件说明')
    expect(html).toContain('关闭补充图片或文档')
  })

  it('uses showModal/close and synchronizes Escape, backdrop and native close with the parent', async () => {
    const scope = effectScope(), visible = ref(false), state = { open: false }
    const showModal = vi.fn(() => { state.open = true }), close = vi.fn(() => { state.open = false })
    const element = shallowRef({ get open() { return state.open }, showModal, close,
      getBoundingClientRect: () => ({ left: 100, right: 600, top: 100, bottom: 600 }) } as unknown as HTMLDialogElement)
    const dismiss = vi.fn(() => { visible.value = false })
    const ui = scope.run(() => useNativeDialog(element, visible, dismiss))!
    try {
      visible.value = true; await nextTick()
      expect(showModal).toHaveBeenCalledOnce()
      ui.backdrop({ target: element.value, clientX: 200, clientY: 200 } as unknown as MouseEvent)
      expect(dismiss).not.toHaveBeenCalled()
      ui.backdrop({ target: element.value, clientX: 20, clientY: 20 } as unknown as MouseEvent)
      await nextTick()
      expect(visible.value).toBe(false)
      expect(close).toHaveBeenCalledOnce()
      visible.value = true; await nextTick()
      const cancel = { preventDefault: vi.fn() } as unknown as Event
      ui.cancel(cancel); await nextTick()
      expect(cancel.preventDefault).toHaveBeenCalledOnce()
      expect(state.open).toBe(false)
      visible.value = true; await nextTick()
      state.open = false; ui.closed(); await nextTick()
      expect(visible.value).toBe(false)
      visible.value = true; await nextTick()
    } finally { scope.stop() }
    expect(state.open).toBe(false)
  })
})
