<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { DEFAULT_MODEL_TIMEOUT_MS, MAX_MODEL_TIMEOUT_MS } from '@defense/shared'
import { PlugZap, Save, KeyRound, ServerCog, ListRestart } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import FormField from '../ui/FormField.vue'
import { useModelSettings } from '../../composables/useModelSettings'
import { useSystemStore } from '../../stores/system'
const settings = useModelSettings()
const {
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
} = settings
const system = useSystemStore()
onMounted(() => settings.run('loading'))
onBeforeUnmount(() => settings.dispose())
async function save() {
  await settings.run('saving')
  if (!settings.error.value) void system.checkHealth()
}
</script>
<template>
  <section class="model-config-card" aria-labelledby="model-config-title">
    <div class="model-config-heading">
      <span class="model-config-icon"><ServerCog :size="24" /></span>
      <div>
        <h2 id="model-config-title">模型配置</h2>
        <p>OpenAI 兼容 API · Chat Completions</p>
      </div>
      <span class="model-config-status">{{
        saved?.hasApiKey ? '已配置密钥' : '尚未配置密钥'
      }}</span>
    </div>
    <p class="model-config-description">
      项目画像、四角色评审和动态追问共用此配置。保存到后端后立即用于后续请求，重启后继续保留。
    </p>
    <div v-if="activity === 'loading'" role="status" class="notice">正在读取后端配置…</div>
    <form class="model-config-form" @submit.prevent="save" novalidate>
      <fieldset :disabled="busy || !loaded">
        <FormField
          id="model-base-url"
          label="API Base URL"
          hint="填写基础地址，系统会追加 /chat/completions。"
          :error="errors.baseUrl"
          ><input
            id="model-base-url"
            v-model="form.baseUrl"
            type="url"
            placeholder="https://api.openai.com/v1"
            :aria-invalid="!!errors.baseUrl"
            aria-describedby="model-base-url-hint model-base-url-error"
        /></FormField>
        <FormField
          id="model-name"
          label="模型名称"
          hint="填写地址与密钥后点击获取模型，也可以直接手动填写模型 ID。"
          :error="errors.model"
          ><div class="model-name-control">
            <select
              v-if="models.length && !manualModel"
              id="model-name"
              v-model="form.model"
              :aria-invalid="!!errors.model"
            >
              <option disabled value="">请选择模型</option>
              <option v-if="form.model && !models.includes(form.model)" :value="form.model">
                {{ form.model }}（当前值，列表未包含）
              </option>
              <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
            </select>
            <input
              v-else
              id="model-name"
              v-model="form.model"
              maxlength="200"
              placeholder="输入模型 ID"
              :aria-invalid="!!errors.model"
            />
            <AppButton
              variant="secondary"
              :disabled="busy || !loaded"
              @click="settings.run('listing')"
              ><ListRestart :size="16" />{{
                activity === 'listing' ? '获取中…' : modelsLoaded ? '刷新模型' : '获取模型'
              }}</AppButton
            >
          </div>
          <div v-if="models.length" class="model-picker-help">
            <span>共 {{ models.length }} 个模型，是否支持对话及结构化输出请通过测试连接确认。</span
            ><button type="button" class="text-button" @click="manualModel = !manualModel">
              {{ manualModel ? '从列表选择' : '手动输入' }}
            </button>
          </div>
          <p v-else-if="modelsLoaded" class="field-hint">该服务未返回模型，可继续手动输入。</p>
        </FormField>
        <FormField
          id="model-api-key"
          label="API 密钥"
          :required="!saved?.hasApiKey"
          :hint="
            saved?.hasApiKey
              ? '后端已有密钥，留空将保留；更换地址时请重新填写。'
              : '密钥仅发送到本机后端，不保存在浏览器。'
          "
          :error="errors.apiKey"
          ><input
            id="model-api-key"
            v-model="form.apiKey"
            type="password"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            maxlength="4096"
            :placeholder="saved?.hasApiKey ? '已保存 · 留空保留原密钥' : '填写 API 密钥'"
            :aria-invalid="!!errors.apiKey"
        /></FormField>
        <div class="model-config-options">
          <FormField id="model-format" label="结构化输出"
            ><select id="model-format" v-model="form.responseFormat">
              <option value="json_schema">JSON Schema（严格校验，推荐）</option>
              <option value="json_object">JSON Object（兼容模式）</option>
            </select></FormField
          ><FormField
            id="model-timeout"
            label="请求超时（毫秒）"
            :hint="`1000～${MAX_MODEL_TIMEOUT_MS}，默认 ${DEFAULT_MODEL_TIMEOUT_MS}。分析较慢时可设为 180000（3 分钟），保存后生效。`"
            :error="errors.timeoutMs"
            ><input
              id="model-timeout"
              v-model.number="form.timeoutMs"
              type="number"
              min="1000"
              :max="MAX_MODEL_TIMEOUT_MS"
              step="1000"
          /></FormField>
        </div>
      </fieldset>
      <div class="model-config-note">
        <KeyRound :size="17" />
        <p>
          接口只返回“是否已配置密钥”，不会回传密钥。测试会向所填地址发送固定短文本，可能消耗少量模型额度，不发送项目资料。
        </p>
      </div>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <p v-if="message" class="notice" role="status">{{ message }}</p>
      <div v-if="connection" class="model-connection-result">
        <span class="status-dot online"></span><strong>模型测试通过</strong
        ><span>{{ connection.model }}</span
        ><span>{{ connection.latencyMs }} ms</span><span>{{ connection.responseFormat }}</span>
      </div>
      <div class="model-config-actions">
        <AppButton variant="secondary" :disabled="busy || !loaded" @click="settings.run('testing')"
          ><PlugZap :size="16" />{{
            activity === 'testing' ? '正在测试连接…' : '测试连接'
          }}</AppButton
        ><AppButton type="submit" :disabled="busy || !loaded"
          ><Save :size="16" />{{ activity === 'saving' ? '正在保存…' : '保存到后端' }}</AppButton
        ><AppButton v-if="!loaded && !busy" variant="ghost" @click="settings.run('loading')"
          >重试读取</AppButton
        >
      </div>
    </form>
    <p v-if="saved" class="model-config-source">
      配置来源：{{
        saved.source === 'saved'
          ? '后端已保存配置'
          : saved.source === 'environment'
            ? '服务端环境变量'
            : '默认值'
      }}<template v-if="saved.updatedAt">
        · 最近保存 {{ new Date(saved.updatedAt).toLocaleString('zh-CN') }}</template
      >
    </p>
  </section>
</template>
