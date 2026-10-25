<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AudioLines, ListMusic, Mic, Play, Save, ShieldCheck, Square } from 'lucide-vue-next'
import { judgeDefinitions } from '@defense/shared'
import AppButton from '../ui/AppButton.vue'
import FormField from '../ui/FormField.vue'
import StatusNotice from '../ui/StatusNotice.vue'
import { useVoiceSettings } from '../../composables/useVoiceSettings'

const settings = useVoiceSettings()
const {form, saved, catalog, selectedJudge, activity, loaded, busy, playing, error, message, errors} = settings
const manualVoices = ref(false)
const voiceDocs = computed(() => form.tts.provider === 'qwen'
  ? 'https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list'
  : 'https://developers.openai.com/api/docs/guides/text-to-speech')
const unavailableJudges = computed(() => form.tts.provider === 'qwen' && catalog.value
  ? judgeDefinitions.filter(judge => !catalog.value!.voices.some(voice => voice.id === form.judges[judge.id])).map(judge => judge.name).join('、') : '')
onMounted(() => settings.run('loading'))
</script>
<template>
  <section id="voice-config" class="model-config-card surface-panel voice-config-card" aria-labelledby="voice-config-title">
    <div class="model-config-heading">
      <span class="model-config-icon"><AudioLines :size="24" /></span>
      <div><h2 id="voice-config-title">语音服务</h2><p>语音作答 · 四位评委朗读</p></div>
      <span class="model-config-status">{{ saved?.enabled ? saved.status === 'configured' ? '语音已启用' : '配置需检查' : '语音未启用' }}</span>
    </div>
    <p class="model-config-description">用麦克风回答，再核对文字后发送。评委问题可以点击朗读。语音识别（ASR）与语音合成（TTS）分别配置，不会自动复用对话模型。</p>
    <StatusNotice v-if="activity === 'loading'" compact busy>正在读取语音配置…</StatusNotice>
    <StatusNotice v-if="saved?.status === 'configuration_error'" tone="error" compact>后端语音配置无法读取，请核对并重新保存有效配置。</StatusNotice>
    <form class="model-config-form" novalidate @submit.prevent="settings.run('saving')">
      <fieldset :disabled="busy || !loaded">
        <label class="embedding-enable"><input id="voice-enabled" v-model="form.enabled" type="checkbox" /><span>启用语音作答与评委朗读</span></label>
        <div class="voice-service-grid">
          <div class="voice-service-section">
            <h3><Mic :size="18" />语音识别 ASR</h3>
            <p>OpenAI 兼容的音频转写接口，将录音转换为可编辑文字。</p>
            <FormField id="voice-asr-url" label="识别 API Base URL" hint="系统会追加 /audio/transcriptions。" :error="errors['asr.baseUrl']">
              <input id="voice-asr-url" v-model="form.asr.baseUrl" type="url" :aria-invalid="!!errors['asr.baseUrl']" aria-describedby="voice-asr-url-hint voice-asr-url-error" placeholder="https://api.openai.com/v1" />
            </FormField>
            <FormField id="voice-asr-model" label="识别模型 ID" :error="errors['asr.model']">
              <input id="voice-asr-model" v-model="form.asr.model" maxlength="200" placeholder="服务商支持的转写模型 ID" :aria-invalid="!!errors['asr.model']" aria-describedby="voice-asr-model-error" />
            </FormField>
            <FormField id="voice-asr-key" label="识别 API 密钥" :required="form.enabled && !saved?.asr.hasApiKey" :hint="saved?.asr.hasApiKey ? '后端已有识别密钥，留空保留；更换地址时重新填写。' : '仅发送到本机后端，不保存在浏览器。'" :error="errors['asr.apiKey']">
              <input id="voice-asr-key" v-model="form.asr.apiKey" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="4096" :placeholder="saved?.asr.hasApiKey ? '已保存 · 留空保留原密钥' : '填写识别服务密钥'" :aria-invalid="!!errors['asr.apiKey']" aria-describedby="voice-asr-key-hint voice-asr-key-error" />
            </FormField>
            <FormField id="voice-asr-timeout" label="识别超时（毫秒）" :error="errors['asr.timeoutMs']">
              <input id="voice-asr-timeout" v-model.number="form.asr.timeoutMs" type="number" min="1000" max="300000" step="1000" :aria-invalid="!!errors['asr.timeoutMs']" aria-describedby="voice-asr-timeout-error" />
            </FormField>
          </div>
          <div class="voice-service-section">
            <h3><AudioLines :size="18" />评委播报 TTS</h3>
            <p>使用阿里云官方语音接口，或支持 /audio/speech 的兼容服务。</p>
            <FormField id="voice-tts-provider" label="播报服务类型" :error="errors['tts.provider']">
              <select id="voice-tts-provider" v-model="form.tts.provider"><option value="qwen">阿里云千问 · 官方语音接口</option><option value="openai_compatible">OpenAI 兼容语音 API</option></select>
            </FormField>
            <FormField id="voice-tts-url" label="播报 API Base URL" :hint="form.tts.provider === 'qwen' ? '填写工作空间的官方 /api/v1 地址，不是 /compatible-mode/v1。' : '系统会追加 /audio/speech；兼容对话接口不代表支持语音。'" :error="errors['tts.baseUrl']">
              <input id="voice-tts-url" v-model="form.tts.baseUrl" type="url" :aria-invalid="!!errors['tts.baseUrl']" aria-describedby="voice-tts-url-hint voice-tts-url-error" />
            </FormField>
            <FormField id="voice-tts-model" label="播报模型 ID" hint="音色需要与模型匹配，请以服务商音色库为准。" :error="errors['tts.model']">
              <input id="voice-tts-model" v-model="form.tts.model" maxlength="200" placeholder="服务商支持的语音模型 ID" :aria-invalid="!!errors['tts.model']" aria-describedby="voice-tts-model-hint voice-tts-model-error" />
            </FormField>
            <FormField id="voice-tts-key" label="播报 API 密钥" :required="form.enabled && !saved?.tts.hasApiKey" :hint="saved?.tts.hasApiKey ? '后端已有播报密钥，留空保留；更换服务或地址时重新填写。' : '独立填写播报服务密钥，密钥不会回显。'" :error="errors['tts.apiKey']">
              <input id="voice-tts-key" v-model="form.tts.apiKey" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="4096" :placeholder="saved?.tts.hasApiKey ? '已保存 · 留空保留原密钥' : '填写播报服务密钥'" :aria-invalid="!!errors['tts.apiKey']" aria-describedby="voice-tts-key-hint voice-tts-key-error" />
            </FormField>
            <FormField id="voice-tts-timeout" label="播报超时（毫秒）" :error="errors['tts.timeoutMs']">
              <input id="voice-tts-timeout" v-model.number="form.tts.timeoutMs" type="number" min="1000" max="300000" step="1000" :aria-invalid="!!errors['tts.timeoutMs']" aria-describedby="voice-tts-timeout-error" />
            </FormField>
          </div>
        </div>
        <div class="voice-catalog-heading">
          <div><h3>四位评委的声音</h3><p>{{ form.tts.provider === 'qwen' ? '首版支持目录中的预置音色，未收录或复刻音色暂不支持。请读取目录后选择。' : '先读取内置目录选择音色，也可以填写兼容服务商提供的音色 ID。' }}</p></div>
          <AppButton variant="secondary" @click="settings.run('catalog')"><ListMusic :size="16" />{{ activity === 'catalog' ? '正在读取…' : '读取预置音色' }}</AppButton>
        </div>
        <div class="voice-catalog-note">
          <span>{{ catalog ? catalog.notice : '内置目录整理自官方文档，不是供应商实时返回的可用列表。' }}</span>
          <a :href="voiceDocs" target="_blank" rel="noopener noreferrer">查看官方音色库 ↗</a>
        </div>
        <StatusNotice v-if="unavailableJudges" compact>当前模型不支持{{ unavailableJudges }}已选音色，请为这些评委重新选择。不会自动替换为其他声音。</StatusNotice>
        <label v-if="form.tts.provider === 'openai_compatible' && catalog?.voices.length" class="voice-manual-toggle"><input v-model="manualVoices" type="checkbox" />手动填写音色 ID</label>
        <div class="voice-judge-grid">
          <FormField v-for="judge in judgeDefinitions" :id="'voice-judge-' + judge.id" :key="judge.id" :label="judge.name" :hint="judge.introduction" :error="errors['judges.' + judge.id]">
            <select v-if="catalog?.voices.length && (form.tts.provider === 'qwen' || !manualVoices)" :id="'voice-judge-' + judge.id" v-model="form.judges[judge.id]" :aria-invalid="!!errors['judges.' + judge.id]" :aria-describedby="'voice-judge-' + judge.id + '-hint voice-judge-' + judge.id + '-error'">
              <option v-if="!catalog.voices.some(voice => voice.id === form.judges[judge.id])" :value="form.judges[judge.id]" :disabled="form.tts.provider === 'qwen'">{{ form.judges[judge.id] }} · {{ form.tts.provider === 'qwen' ? '需重新选择' : '手动配置' }}</option>
              <option v-for="voice in catalog.voices" :key="voice.id" :value="voice.id">{{ voice.name }} · {{ voice.description }}</option>
            </select>
            <input v-else :id="'voice-judge-' + judge.id" v-model="form.judges[judge.id]" maxlength="100" :readonly="form.tts.provider === 'qwen'" :placeholder="form.tts.provider === 'qwen' ? '读取预置音色后选择' : '音色 ID'" :aria-invalid="!!errors['judges.' + judge.id]" :aria-describedby="'voice-judge-' + judge.id + '-hint voice-judge-' + judge.id + '-error'" />
          </FormField>
        </div>
        <div class="voice-preview-controls">
          <FormField id="voice-preview-judge" label="选择试听评委" :required="false"><select id="voice-preview-judge" v-model="selectedJudge"><option v-for="judge in judgeDefinitions" :key="judge.id" :value="judge.id">{{ judge.name }}</option></select></FormField>
          <AppButton variant="secondary" @click="settings.run('preview')"><Play :size="16" />生成并试听</AppButton>
        </div>
      </fieldset>
      <div v-if="activity === 'preview' || playing" class="voice-preview-status" role="status"><span>{{ activity === 'preview' ? '正在生成试听音频…' : '正在播放评委试听' }}</span><AppButton variant="ghost" @click="settings.stopPreview()"><Square :size="15" />停止试听</AppButton></div>
      <p class="voice-preview-scope">试听会向当前播报服务发送固定示例文字，可能产生服务费用。试听仅验证 TTS 播报，不验证 ASR 识别；声音由 AI 合成。</p>
      <div class="model-config-note"><ShieldCheck :size="17" /><p>密钥仅保存在本机后端。识别时录音发送给配置的 ASR 服务；朗读时问题文字发送给 TTS 服务。不会自动试听、上传录音或长期保存原始录音。</p></div>
      <StatusNotice v-if="error" tone="error" compact>{{ error }}</StatusNotice>
      <StatusNotice v-if="message" :tone="message.startsWith('已保存到后端') ? 'success' : 'info'" compact>{{ message }}</StatusNotice>
      <div class="model-config-actions"><AppButton type="submit" :disabled="busy || !loaded"><Save :size="16" />{{ activity === 'saving' ? '正在保存…' : '保存语音配置' }}</AppButton><AppButton v-if="!loaded && !busy" variant="ghost" @click="settings.run('loading')">重试读取</AppButton></div>
    </form>
    <p v-if="saved" class="model-config-source">配置来源：{{ saved.source === 'saved' ? '后端已保存配置' : '默认值' }}<template v-if="saved.updatedAt"> · 最近保存 {{ new Date(saved.updatedAt).toLocaleString('zh-CN') }}</template></p>
  </section>
</template>
<style src="../../styles/voice-settings.css"></style>
