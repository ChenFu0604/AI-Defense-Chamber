import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { embeddingSettingsInputSchema, type EmbeddingSettingsInput, type PublicEmbeddingSettings } from '@defense/shared'
import { getEmbeddingSettings, saveEmbeddingSettings, testEmbeddingConnection } from '../services/embedding-settings-api'

export function useEmbeddingSettings() {
  const form = reactive<EmbeddingSettingsInput>({enabled: false, baseUrl: 'https://api.openai.com/v1', model: '', apiKey: '', timeoutMs: 120000, dimensions: null, minSimilarity: 0.35})
  const saved = ref<PublicEmbeddingSettings | null>(null)
  const connection = ref<Awaited<ReturnType<typeof testEmbeddingConnection>> | null>(null)
  const activity = ref<'idle' | 'loading' | 'saving' | 'testing'>('idle')
  const loaded = ref(false), error = ref(''), message = ref('')
  const errors = ref<Partial<Record<keyof EmbeddingSettingsInput, string>>>({})
  const busy = computed(() => activity.value !== 'idle')
  let disposed = false, revision = 0, controller: AbortController | null = null
  watch(form, () => { revision++; connection.value = null; message.value = ''; errors.value = {} }, {flush: 'sync'})
  function apply(value: PublicEmbeddingSettings) {
    saved.value = value
    Object.assign(form, {enabled: value.enabled, baseUrl: value.baseUrl, model: value.model, apiKey: '', timeoutMs: value.timeoutMs, dimensions: value.dimensions, minSimilarity: value.minSimilarity})
    loaded.value = true
  }
  function validate(test: boolean) {
    const parsed = embeddingSettingsInputSchema.safeParse(form)
    errors.value = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof EmbeddingSettingsInput
        if (!errors.value[key]) errors.value[key] = issue.message
      }
      return null
    }
    if ((test || parsed.data.enabled) && !parsed.data.model.trim()) errors.value.model = '请填写支持 Embeddings 的模型 ID。'
    if ((test || parsed.data.enabled) && !parsed.data.apiKey && !saved.value?.hasApiKey) errors.value.apiKey = '请填写向量模型的 API 密钥。'
    if (!parsed.data.apiKey && saved.value?.hasApiKey && parsed.data.baseUrl.replace(/\/+$/, '') !== saved.value.baseUrl.replace(/\/+$/, '')) errors.value.apiKey = '更换 API 地址时请重新填写密钥。'
    return Object.keys(errors.value).length ? null : parsed.data
  }
  async function run(action: 'loading' | 'saving' | 'testing') {
    if (busy.value || disposed) return
    const input = action === 'loading' ? null : validate(action === 'testing')
    if (action !== 'loading' && !input) return
    const startRevision = revision
    controller = new AbortController()
    activity.value = action; error.value = ''; message.value = ''; connection.value = null
    try {
      const result = action === 'loading' ? await getEmbeddingSettings(controller.signal)
        : action === 'saving' ? await saveEmbeddingSettings(input!, controller.signal)
          : await testEmbeddingConnection(input!, controller.signal)
      if (disposed || revision !== startRevision) return
      if (action === 'testing') {
        connection.value = result as Awaited<ReturnType<typeof testEmbeddingConnection>>
        message.value = '已验证固定文本的向量响应；当前表单需保存后生效。此测试不验证项目检索质量。'
      } else {
        apply(result as PublicEmbeddingSettings)
        if (action === 'saving') message.value = '已保存到后端。已启用时后续 AI 材料检索使用混合检索；更换模型后需重新建立向量索引。'
      }
    } catch (failure) {
      if (!disposed && revision === startRevision) error.value = failure instanceof Error ? failure.message : '向量模型设置失败，请重试。'
    } finally {
      if (!disposed) activity.value = 'idle'
      controller = null
    }
  }
  function dispose() { disposed = true; controller?.abort(); form.apiKey = ''; activity.value = 'idle' }
  onScopeDispose(dispose)
  return {form, saved, connection, activity, loaded, busy, error, message, errors, run, dispose}
}
