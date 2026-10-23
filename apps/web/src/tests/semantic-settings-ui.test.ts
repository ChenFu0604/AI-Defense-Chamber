import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import EmbeddingConfigCard from '../components/settings/EmbeddingConfigCard.vue'

describe('embedding settings presentation', () => {
  it('shows an independent embedding form, honest connection scope and external data disclosure', async () => {
    const html = await renderToString(createSSRApp(EmbeddingConfigCard))
    expect(html).toContain('向量模型配置'); expect(html).toContain('OpenAI 兼容 API · Embeddings')
    expect(html).toContain('不发送项目资料'); expect(html).toContain('语义检索未启用')
    expect(html).toContain('发送给你配置的向量服务'); expect(html).toContain('不会直接使用上方的对话模型')
    expect(html).toContain('type="password"'); expect(html).toContain('max="4096"'); expect(html).toContain('保存向量配置')
    expect(html).not.toContain('type="password" value="fixture-secret"')
  })
})
