import { computed, reactive, ref, watch } from 'vue'
import {
  modelSettingsInputSchema,
  DEFAULT_MODEL_TIMEOUT_MS,
  type ModelSettingsInput,
  type PublicModelSettings,
  type ModelConnectionResult,
  modelListRequestSchema,
} from '@defense/shared'
import {
  getModelSettings,
  saveModelSettings,
  testModelConnection,
  listAvailableModels,
} from '../services/model-settings-api'

export function useModelSettings() {
  const form = reactive<ModelSettingsInput>({
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    apiKey: '',
    timeoutMs: DEFAULT_MODEL_TIMEOUT_MS,
    responseFormat: 'json_schema',
  })
  const saved = ref<PublicModelSettings | null>(null),
    connection = ref<ModelConnectionResult | null>(null)
  const activity = ref<'idle' | 'loading' | 'saving' | 'testing' | 'listing'>('idle')
  const models = ref<string[]>([]),
    modelsLoaded = ref(false),
    manualModel = ref(false)
  const error = ref(''),
    message = ref(''),
    loaded = ref(false)
  const errors = ref<Partial<Record<keyof ModelSettingsInput, string>>>({})
  const busy = computed(() => activity.value !== 'idle')
  let controller: AbortController | null = null,
    disposed = false
  watch(
    form,
    () => {
      connection.value = null
      message.value = ''
      errors.value = {}
    },
    { flush: 'sync' },
  )
  watch(
    () => [form.baseUrl, form.apiKey],
    () => {
      models.value = []
      modelsLoaded.value = false
      manualModel.value = false
    },
    { flush: 'sync' },
  )
  function apply(value: PublicModelSettings) {
    saved.value = value
    Object.assign(form, {
      baseUrl: value.baseUrl,
      model: value.model,
      apiKey: '',
      timeoutMs: value.timeoutMs,
      responseFormat: value.responseFormat,
    })
    loaded.value = true
  }
  function validate(listing = false) {
    const parsed = listing
      ? modelListRequestSchema.safeParse({
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          timeoutMs: form.timeoutMs,
        })
      : modelSettingsInputSchema.safeParse(form)
    errors.value = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ModelSettingsInput
        if (!errors.value[key]) errors.value[key] = issue.message
      }
      return null
    }
    if (!parsed.data.apiKey && !saved.value?.hasApiKey) {
      errors.value.apiKey = '请填写 API 密钥。'
      return null
    }
    if (
      !parsed.data.apiKey &&
      parsed.data.baseUrl.replace(/\/+$/, '') !== saved.value?.baseUrl.replace(/\/+$/, '')
    ) {
      errors.value.apiKey = '更换 API 地址时请重新填写密钥。'
      return null
    }
    return parsed.data
  }
  async function run(action: 'loading' | 'saving' | 'testing' | 'listing') {
    if (busy.value || disposed) return
    const input = action === 'loading' ? null : validate(action === 'listing')
    if (action !== 'loading' && !input) return
    activity.value = action
    error.value = ''
    message.value = ''
    controller = new AbortController()
    try {
      if (action === 'loading') {
        const value = await getModelSettings(controller.signal)
        if (!disposed) apply(value)
      } else if (action === 'saving') {
        const value = await saveModelSettings(input as ModelSettingsInput, controller.signal)
        if (!disposed) {
          apply(value)
          message.value = '已保存到后端，后续模型请求立即生效。保存不代表连接已经验证。'
        }
      } else if (action === 'listing') {
        models.value = []
        modelsLoaded.value = false
        const value = await listAvailableModels(input!, controller.signal)
        if (
          !disposed &&
          form.baseUrl.trim() === input!.baseUrl &&
          form.apiKey.trim() === input!.apiKey
        ) {
          models.value = value.models
          modelsLoaded.value = true
          manualModel.value = false
          message.value = value.models.length
            ? `已获取 ${value.models.length} 个模型，请选择后测试连接并保存。`
            : '服务返回的模型列表为空，可以手动填写模型 ID。'
        }
      } else {
        connection.value = null
        const value = await testModelConnection(input as ModelSettingsInput, controller.signal)
        if (!disposed) {
          connection.value = value
          message.value = '连接与所选结构化格式测试通过。当前表单尚需点击保存才会生效。'
        }
      }
    } catch (failure) {
      if (!disposed)
        error.value = failure instanceof Error ? failure.message : '模型设置操作失败，请重试。'
    } finally {
      if (!disposed) activity.value = 'idle'
      controller = null
    }
  }
  function dispose() {
    disposed = true
    controller?.abort()
    form.apiKey = ''
  }
  return {
    form,
    saved,
    connection,
    models,
    modelsLoaded,
    manualModel,
    activity,
    busy,
    error,
    message,
    loaded,
    errors,
    run,
    dispose,
  }
}
