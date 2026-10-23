<script setup lang="ts">
import { onMounted } from 'vue'
import { Network, PlugZap, Save, ShieldCheck } from 'lucide-vue-next'
import AppButton from '../ui/AppButton.vue'
import FormField from '../ui/FormField.vue'
import StatusNotice from '../ui/StatusNotice.vue'
import { useEmbeddingSettings } from '../../composables/useEmbeddingSettings'
const settings = useEmbeddingSettings()
const {form, saved, connection, activity, loaded, busy, error, message, errors} = settings
onMounted(() => settings.run('loading'))
</script>
<template>
  <section id="embedding-config" class="model-config-card surface-panel" aria-labelledby="embedding-config-title">
    <div class="model-config-heading">
      <span class="model-config-icon"><Network :size="24" /></span>
      <div><h2 id="embedding-config-title">向量模型配置</h2><p>OpenAI 兼容 API · Embeddings</p></div>
      <span class="model-config-status">{{ saved?.enabled ? saved.status === 'configured' ? '语义检索已启用' : '启用中 · 配置需检查' : '语义检索未启用' }}</span>
    </div>
    <p class="model-config-description">语义检索可以按意思寻找资料，混合检索同时参考关键词。它使用独立的向量模型，不会直接使用上方的对话模型。</p>
    <StatusNotice v-if="activity === 'loading'" compact busy>正在读取向量模型配置…</StatusNotice>
    <StatusNotice v-if="saved?.status === 'configuration_error'" tone="error" compact>后端保存的向量配置无法读取。请核对并重新保存有效配置，当前不能使用语义检索。</StatusNotice>
    <form class="model-config-form" novalidate @submit.prevent="settings.run('saving')">
      <fieldset :disabled="busy || !loaded">
        <label class="embedding-enable"><input id="embedding-enabled" v-model="form.enabled" type="checkbox" /><span>启用语义检索与 AI 材料混合检索</span></label>
        <FormField id="embedding-base-url" label="向量 API Base URL" hint="填写基础地址，系统会追加 /embeddings。" :error="errors.baseUrl"><input id="embedding-base-url" v-model="form.baseUrl" type="url" placeholder="https://api.openai.com/v1" :aria-invalid="!!errors.baseUrl" aria-describedby="embedding-base-url-hint embedding-base-url-error" /></FormField>
        <FormField id="embedding-model" label="向量模型 ID" hint="请使用服务商明确支持 Embeddings 的模型。对话模型通常不能生成向量。" :required="form.enabled" :error="errors.model"><input id="embedding-model" v-model="form.model" maxlength="200" placeholder="例如 text-embedding-3-small" :aria-invalid="!!errors.model" aria-describedby="embedding-model-hint embedding-model-error" /></FormField>
        <FormField id="embedding-key" label="向量 API 密钥" :required="form.enabled && !saved?.hasApiKey" :hint="saved?.hasApiKey ? '后端已有独立密钥，留空保留；更换地址时请重新填写。' : '密钥仅发送到本机后端，不保存在浏览器。'" :error="errors.apiKey"><input id="embedding-key" v-model="form.apiKey" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="4096" :placeholder="saved?.hasApiKey ? '已保存 · 留空保留原密钥' : '填写向量 API 密钥'" :aria-invalid="!!errors.apiKey" /></FormField>
        <div class="model-config-options">
          <FormField id="embedding-dimensions" label="向量维度" :required="false" hint="留空使用模型默认维度；仅部分服务支持指定维度，最多 4096 维。" :error="errors.dimensions"><input id="embedding-dimensions" :value="form.dimensions ?? ''" type="number" min="1" max="4096" step="1" placeholder="模型默认" @input="form.dimensions = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)" /></FormField>
          <FormField id="embedding-similarity" label="最低语义相似度" hint="过滤低相关候选，分数不代表事实可信度。建议先用默认值 0.35。" :error="errors.minSimilarity"><input id="embedding-similarity" v-model.number="form.minSimilarity" type="number" min="0" max="1" step="0.05" /></FormField>
        </div>
        <FormField id="embedding-timeout" label="请求超时（毫秒）" :error="errors.timeoutMs"><input id="embedding-timeout" v-model.number="form.timeoutMs" type="number" min="1000" max="300000" step="1000" /></FormField>
      </fieldset>
      <div class="model-config-note"><ShieldCheck :size="17" /><p>建立向量索引与语义/混合搜索会将资料文字、检索问题发送给你配置的向量服务。关键词搜索仍在本机完成。测试连接只发送固定短文本，不发送项目资料，也不会自动建立资料索引。</p></div>
      <StatusNotice v-if="error" tone="error" compact>{{ error }}</StatusNotice>
      <StatusNotice v-if="message" :tone="connection || message.startsWith('已保存到后端') ? 'success' : 'info'" compact>{{ message }}</StatusNotice>
      <div v-if="connection" class="model-connection-result"><strong>向量响应校验通过</strong><span>{{ connection.model }}</span><span>{{ connection.dimensions }} 维</span><span>{{ connection.latencyMs }} ms</span></div>
      <div class="model-config-actions"><AppButton variant="secondary" :disabled="busy || !loaded" @click="settings.run('testing')"><PlugZap :size="16" />{{ activity === 'testing' ? '正在测试…' : '测试向量连接' }}</AppButton><AppButton type="submit" :disabled="busy || !loaded"><Save :size="16" />{{ activity === 'saving' ? '正在保存…' : '保存向量配置' }}</AppButton><AppButton v-if="!loaded && !busy" variant="ghost" @click="settings.run('loading')">重试读取</AppButton></div>
    </form>
    <p v-if="saved" class="model-config-source">配置来源：{{ saved.source === 'saved' ? '后端已保存配置' : saved.source === 'environment' ? '服务端环境变量' : '默认值' }}<template v-if="saved.updatedAt"> · 最近保存 {{ new Date(saved.updatedAt).toLocaleString('zh-CN') }}</template></p>
  </section>
</template>
