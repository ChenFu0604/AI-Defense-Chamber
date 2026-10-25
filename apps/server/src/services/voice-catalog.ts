import { voiceCatalogSchema, type VoiceSettingsInput } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'

const common31 = [
  ['longanhuan_v3.1', '龙安欢', '明亮自然，适合轻松交流。'],
  ['longanlingxin_v3.1', '龙安灵心', '温柔亲切，适合引导思考。'],
  ['longanfengyue_v3.1', '龙安风悦', '清晰自然，适合讲解。'],
  ['xunanchuan_v3.1', '许南川', '男声，适合平和交流。'],
] as const
const flash31 = [
  ...common31,
  ['anmingyuan_v3.1', '安明远', '清亮自然的男声。'],
  ['xuyanchu_v3.1', '许言初', '沉稳磁性的女声。'],
  ['wenhuaizhi_v3.1', '闻怀之', '稳重成熟的女声。'],
  ['yeqinghe_v3.1', '叶清禾', '亲切温柔的女声。'],
] as const
const qwenModels: Record<string, readonly (readonly [string, string, string])[]> = {
  'qwen-audio-3.1-tts-flash': flash31,
  'qwen-audio-3.1-tts-plus': common31,
  'qwen-audio-3.0-tts-plus': [
    ['longanlingxin', '龙安灵心', '知心温暖的女声。'],
    ['longanlufeng', '龙安鲁风', '明亮开朗的男声。'],
  ],
  'qwen-audio-3.0-tts-flash': [
    ['longanfengyue', '龙安风悦', '自然亲切的女声。'],
    ['longanyuanfei', '龙安元妃', '有角色感的女声。'],
    ['longanlingxi', '龙安灵希', '可爱甜美的女声。'],
    ['longanxiaoxin', '龙安小昕', '亲切活泼的女声。'],
    ['longanhuan_v3.6', '龙安欢', '自然交流女声。'],
  ],
}

export function getVoiceCatalog(tts: Pick<VoiceSettingsInput['tts'], 'provider' | 'model'>) {
  const qwen = tts.provider === 'qwen'
  const values = qwen ? qwenModels[tts.model] : ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'].map(id => [id, id, '内置参考音色；兼容供应商的实际支持以其文档与试听结果为准。'])
  if (!values) throw new AppError(400, 'VOICE_MODEL_UNSUPPORTED', '当前 Qwen 模型未收录音色映射，请选择 qwen-audio-3.1-tts-flash、3.1-tts-plus、3.0-tts-flash 或 3.0-tts-plus。')
  return voiceCatalogSchema.parse({
    source: 'builtin', provider: tts.provider, model: tts.model,
    docsUrl: qwen ? 'https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list' : 'https://developers.openai.com/api/docs/guides/text-to-speech',
    notice: qwen ? '按官方文档维护的内置音色子集，并非实时查询或完整音色库；模型、音色和地域必须匹配。3.1 精品中文音色仅北京地域可用。' : 'OpenAI 内置参考音色，并非供应商实时列表；兼容服务可能只支持部分音色或使用自定义 ID。',
    voices: values.map(([id, name, description]) => ({ id, name, description, languages: qwen ? ['中文'] : ['多语言（依供应商）'] })),
  })
}

export function validateQwenVoice(tts: VoiceSettingsInput['tts'], voice: string) {
  if (tts.provider !== 'qwen') return
  const catalog = getVoiceCatalog(tts)
  if (!catalog.voices.some(item => item.id === voice))
    throw new AppError(400, 'VOICE_MODEL_MISMATCH', '所选音色不属于当前 Qwen 模型的内置列表，请重新加载音色并选择。')
  if (tts.baseUrl.includes('.ap-southeast-1.') && !common31.some(item => item[0] === voice) && tts.model === 'qwen-audio-3.1-tts-flash')
    throw new AppError(400, 'VOICE_REGION_MISMATCH', '该精品中文音色仅北京地域可用，请切换北京地址或选择多语种音色。')
}

export function validateTtsEndpoint(tts: VoiceSettingsInput['tts']) {
  if (tts.provider !== 'qwen') return
  const url = new URL(tts.baseUrl)
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.(cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/i.test(url.hostname) || /your_workspace_id/i.test(tts.baseUrl) || !['', '/', '/api/v1'].includes(url.pathname))
    throw new AppError(400, 'VOICE_QWEN_ENDPOINT_INVALID', 'Qwen 请填写带真实业务空间 ID 的北京或新加坡 HTTPS 地址，格式为 https://业务空间ID.cn-beijing.maas.aliyuncs.com/api/v1。')
}
