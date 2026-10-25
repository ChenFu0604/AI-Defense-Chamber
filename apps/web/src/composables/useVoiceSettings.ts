import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { defaultVoiceSettings, voiceSettingsInputSchema, type JudgeId, type PublicVoiceSettings, type VoiceCatalog, type VoiceSettingsInput } from '@defense/shared'
import { getVoiceSettings, listVoiceCatalog, previewVoiceAudio, saveVoiceSettings } from '../services/voice-api'

type Activity = 'idle' | 'loading' | 'saving' | 'catalog' | 'preview'
export function useVoiceSettings() {
  const form = reactive<VoiceSettingsInput>(structuredClone(defaultVoiceSettings))
  const saved = ref<PublicVoiceSettings | null>(null)
  const catalog = ref<VoiceCatalog | null>(null)
  const selectedJudge = ref<JudgeId>('business')
  const activity = ref<Activity>('idle'), loaded = ref(false), playing = ref(false)
  const error = ref(''), message = ref(''), errors = ref<Record<string, string>>({})
  const busy = computed(() => activity.value !== 'idle')
  let disposed = false, applying = false, revision = 0, operation = 0
  let controller: AbortController | null = null, player: HTMLAudioElement | null = null, audioUrl: string | null = null

  function releaseAudio() {
    if (player) { player.onended = null; player.onerror = null; player.pause(); player.removeAttribute('src'); player.load(); player = null }
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null }
    playing.value = false
  }
  function stopPreview() {
    if (activity.value === 'preview') { operation++; controller?.abort(); controller = null; activity.value = 'idle' }
    releaseAudio()
  }
  watch(form, () => {
    revision++; error.value = ''; message.value = ''; errors.value = {}
    stopPreview()
  }, {flush: 'sync'})
  watch(() => [form.tts.provider, form.tts.model], () => { catalog.value = null }, {flush: 'sync'})
  watch(() => form.tts.provider, provider => {
    if (applying) return
    // Credentials must be entered again when changing provider; never copy a key to another service.
    form.tts.apiKey = ''
    form.tts.baseUrl = provider === 'qwen' ? defaultVoiceSettings.tts.baseUrl : 'https://api.openai.com/v1'
    form.tts.model = provider === 'qwen' ? defaultVoiceSettings.tts.model : ''
    Object.assign(form.judges, provider === 'qwen' ? defaultVoiceSettings.judges : {business: 'alloy', technical: 'echo', user: 'shimmer', devil: 'onyx'})
  }, {flush: 'sync'})
  watch(selectedJudge, () => { stopPreview(); message.value = '' }, {flush: 'sync'})

  function apply(value: PublicVoiceSettings) {
    applying = true
    try {
      Object.assign(form, {enabled: value.enabled,
        asr: {baseUrl: value.asr.baseUrl, model: value.asr.model, timeoutMs: value.asr.timeoutMs, apiKey: ''},
        tts: {provider: value.tts.provider, baseUrl: value.tts.baseUrl, model: value.tts.model, timeoutMs: value.tts.timeoutMs, apiKey: ''},
        judges: {...value.judges}})
    } finally { applying = false }
    saved.value = value; loaded.value = true
  }
  function validate(action: Exclude<Activity, 'idle' | 'loading'>) {
    errors.value = {}
    const parsed = voiceSettingsInputSchema.safeParse(form)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.')
        if (!errors.value[key]) errors.value[key] = issue.message
      }
      return null
    }
    for (const kind of ['asr', 'tts'] as const) {
      const endpoint = parsed.data[kind], previous = saved.value?.[kind]
      const needed = (action === 'saving' && parsed.data.enabled) || (action === 'preview' && kind === 'tts')
      const sameProvider = kind !== 'tts' || form.tts.provider === saved.value?.tts.provider
      const sameDestination = !!previous && endpoint.baseUrl.replace(/\/+$/, '') === previous.baseUrl.replace(/\/+$/, '') && sameProvider
      if (needed && !endpoint.apiKey && !(sameDestination && previous?.hasApiKey)) errors.value[kind + '.apiKey'] = sameDestination ? '请填写此语音服务的 API 密钥。' : previous?.hasApiKey ? '更换服务或 API 地址后，请重新填写密钥。' : '请填写此语音服务的 API 密钥。'
    }
    if (parsed.data.tts.provider === 'qwen' && catalog.value && (action === 'preview' || (action === 'saving' && parsed.data.enabled))) {
      const ids = action === 'preview' ? [selectedJudge.value] : ['business', 'technical', 'user', 'devil'] as const
      for (const id of ids) {
        if (!catalog.value.voices.some(voice => voice.id === parsed.data.judges[id])) errors.value['judges.' + id] = '此音色不支持当前模型，请从目录重新选择。'
      }
    }
    return Object.keys(errors.value).length ? null : parsed.data
  }
  async function run(action: Exclude<Activity, 'idle'>) {
    if (disposed || busy.value || (action !== 'loading' && !loaded.value)) return
    const input = action === 'loading' ? null : validate(action)
    if (action !== 'loading' && !input) return
    stopPreview()
    const startRevision = revision, current = ++operation
    controller = new AbortController()
    const signal = controller.signal
    activity.value = action; error.value = ''; message.value = ''
    try {
      if (action === 'loading' || action === 'saving') {
        const result = action === 'loading' ? await getVoiceSettings(signal) : await saveVoiceSettings(input!, signal)
        if (disposed || current !== operation || revision !== startRevision) return
        apply(result)
        if (action === 'saving') message.value = '已保存到后端。语音识别与评委播报将使用此配置；保存不代表连接已测试。'
      } else if (action === 'catalog') {
        const result = await listVoiceCatalog(input!, signal)
        if (disposed || current !== operation || revision !== startRevision) return
        catalog.value = result
        message.value = '已读取内置音色目录，未连接供应商查询，也未测试服务。请核对模型支持范围。'
      } else {
        const result = await previewVoiceAudio({settings: input!, judgeId: selectedJudge.value}, signal)
        if (disposed || current !== operation || revision !== startRevision) return
        audioUrl = URL.createObjectURL(result)
        player = new Audio(audioUrl)
        player.onended = () => releaseAudio()
        player.onerror = () => { releaseAudio(); error.value = '音频播放失败，请检查浏览器音频支持后重试。' }
        await player.play()
        if (disposed || current !== operation || revision !== startRevision) return
        playing.value = true
        message.value = '试听音频由当前 TTS 服务真实生成，仅验证播报；未验证语音识别 ASR，当前表单保存后才用于答辩。'
      }
    } catch (failure) {
      if (!disposed && current === operation && revision === startRevision) {
        if (action === 'preview') releaseAudio()
        error.value = failure instanceof Error ? failure.message : '语音设置操作失败，请重试。'
      }
    } finally {
      if (!disposed && current === operation) { activity.value = 'idle'; controller = null }
    }
  }
  function dispose() {
    disposed = true; operation++; controller?.abort(); controller = null; releaseAudio()
    form.asr.apiKey = ''; form.tts.apiKey = ''; activity.value = 'idle'
  }
  onScopeDispose(dispose)
  return {form, saved, catalog, selectedJudge, activity, loaded, busy, playing, error, message, errors, run, stopPreview, dispose}
}
