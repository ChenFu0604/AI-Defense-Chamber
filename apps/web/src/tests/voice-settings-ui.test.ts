import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import VoiceConfigCard from '../components/settings/VoiceConfigCard.vue'

describe('voice settings presentation', () => {
  it('offers independent ASR/TTS, four role assignments and honest catalog/test scope', async () => {
    const html = await renderToString(createSSRApp(VoiceConfigCard))
    expect(html).toContain('语音识别 ASR'); expect(html).toContain('评委播报 TTS')
    expect(html).toContain('读取预置音色'); expect(html).toContain('不是供应商实时返回')
    expect(html).toContain('试听仅验证 TTS 播报，不验证 ASR 识别')
    expect(html).toContain('可能产生服务费用'); expect(html).toContain('声音由 AI 合成')
    for (const id of ['business', 'technical', 'user', 'devil']) expect(html).toContain('id="voice-judge-' + id + '"')
    expect(html.match(/type="password"/g)).toHaveLength(2)
    expect(html).toContain('保存语音配置'); expect(html).toContain('compatible-mode/v1')
    expect(html).not.toContain('自动获取供应商音色成功')
  })
})
