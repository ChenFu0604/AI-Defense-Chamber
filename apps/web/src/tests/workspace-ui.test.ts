import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import AppButton from '../components/ui/AppButton.vue'

describe('shared workspace button', () => {
  it('exposes loading state and prevents clicks while a request is in progress', async () => {
    const busy = await renderToString(
      createSSRApp({ render: () => h(AppButton, { busy: true }, () => '提交中') }),
    )
    expect(busy).toContain('disabled')
    expect(busy).toContain('aria-busy="true"')
    const idle = await renderToString(
      createSSRApp({ render: () => h(AppButton, {}, () => '提交') }),
    )
    expect(idle).not.toContain('disabled')
    expect(idle).not.toContain('aria-busy')
  })
})
