<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Mic, Square, RotateCcw, Check, LoaderCircle } from 'lucide-vue-next'
import { appendVoiceTranscript, useVoiceInput } from '../../composables/useVoiceInput'
import { useVoiceReadiness } from '../../composables/useVoiceReadiness'
import AppButton from '../ui/AppButton.vue'
import StatusNotice from '../ui/StatusNotice.vue'

const props = defineProps<{ draft: string; contextKey: string; disabled: boolean }>()
const emit = defineEmits<{ confirm: [text: string]; cancel: [] }>()
const { state, error, transcript, seconds, audio, busy, start, stop, transcribe, cancel } = useVoiceInput()
const readiness = useVoiceReadiness()
const { state: readinessState, ready: voiceReady, error: readinessError } = readiness
onMounted(() => readiness.load())
const mergeError = ref('')
watch([state, transcript], () => { mergeError.value = '' })
const duration = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`)
watch(() => props.contextKey, () => { cancel(); emit('cancel') }, { flush: 'sync' })
watch(() => props.disabled, value => { if (value) { cancel(); emit('cancel') } }, { flush: 'sync' })
function startRecording() { if (voiceReady.value && !props.disabled) void start() }
function confirm() {
  if (props.disabled || state.value !== 'review') return
  try { emit('confirm', appendVoiceTranscript(props.draft, transcript.value)); cancel() }
  catch (failure) { mergeError.value = failure instanceof Error ? failure.message : '无法加入草稿，请检查识别内容。' }
}
</script>
<template>
  <div class="voice-answer-panel">
    <p class="voice-privacy-note">转写会将录音发送到你配置的语音服务。请先核对识别文字，再加入回答草稿；不会自动发送回答。</p>
    <StatusNotice v-if="readinessState === 'idle' || readinessState === 'loading'" compact busy>正在检查本机保存的语音配置…</StatusNotice>
    <StatusNotice v-else-if="readinessError" :tone="readinessState === 'error' ? 'error' : 'info'" compact>
      {{ readinessError }}
      <template #actions><RouterLink to="/settings#voice-config">配置语音服务</RouterLink><AppButton variant="ghost" @click="readiness.load()">重新检查配置</AppButton></template>
    </StatusNotice>
    <p v-else-if="voiceReady" class="voice-privacy-note">已读取保存的语音配置，实际识别效果将在转写时验证。</p>
    <div class="voice-capture-status" aria-live="polite">
      <span class="voice-capture-icon" :class="{ 'is-recording': state === 'recording' }"><Mic :size="25" /></span>
      <strong>{{ state === 'recording' ? '正在听你说' : state === 'stopping' ? '正在整理录音' : state === 'requesting' ? '等待麦克风授权' : state === 'transcribing' ? '正在识别你的回答' : state === 'review' ? '核对识别内容' : audio ? '录音已就绪' : '准备好就开始说吧' }}</strong>
      <span class="voice-duration">{{ duration }} / 2:00</span>
      <small>{{ state === 'recording' ? '说完后停止录音，最长两分钟；切到后台会停止录音。' : state === 'transcribing' ? '可以取消，原有草稿会保留。' : '也可以随时关闭窗口，继续使用文字作答。' }}</small>
    </div>
    <StatusNotice v-if="error" tone="error" compact>{{ error }}<template #actions><RouterLink to="/settings">检查语音服务设置</RouterLink></template></StatusNotice>
    <div class="voice-capture-actions">
      <AppButton v-if="state === 'idle' || state === 'error'" :disabled="disabled || !voiceReady" @click="startRecording"><Mic :size="16" />开始录音</AppButton>
      <AppButton v-if="state === 'recording'" @click="stop"><Square :size="15" />停止录音</AppButton>
      <AppButton v-if="audio && state !== 'review'" :disabled="busy || disabled" :busy="state === 'transcribing'" @click="transcribe"><LoaderCircle v-if="state === 'transcribing'" :size="16" class="spinning" />{{ state === 'transcribing' ? '识别中…' : error ? '重试识别' : '识别为文字' }}</AppButton>
      <AppButton v-if="audio" variant="secondary" :disabled="busy || disabled || !voiceReady" @click="startRecording"><RotateCcw :size="15" />重新录音</AppButton>
      <AppButton variant="ghost" @click="emit('cancel')">取消</AppButton>
    </div>
    <div v-if="state === 'review'" class="voice-transcript-review">
      <label for="voice-transcript">识别文字，可修改</label>
      <textarea id="voice-transcript" v-model="transcript" rows="6" :disabled="disabled" aria-describedby="voice-merge-hint" />
      <small id="voice-merge-hint">{{ transcript.length }} 字 · {{ draft.trim() ? '将追加到现有草稿后，原有文字保留。' : '加入草稿后，仍需手动发送。' }}回答合计最多 4000 字。</small>
      <StatusNotice v-if="mergeError" tone="error" compact>{{ mergeError }}</StatusNotice>
      <AppButton :disabled="disabled || !transcript.trim()" @click="confirm"><Check :size="16" />{{ draft.trim() ? '追加到回答草稿' : '加入回答草稿' }}</AppButton>
    </div>
  </div>
</template>
<style scoped>
.voice-answer-panel { display: grid; gap: 20px; }
.voice-privacy-note { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.8; }
.voice-capture-status { display: flex; align-items: center; flex-direction: column; gap: 10px; padding: 24px 16px; background: var(--surface-subtle); border-radius: 16px; text-align: center; }
.voice-capture-icon { display: grid; place-items: center; width: 58px; height: 58px; border-radius: 50%; color: var(--accent); background: var(--accent-soft); }
.voice-capture-icon.is-recording { box-shadow: 0 0 0 8px var(--accent-soft); animation: recording-pulse 1.8s ease-in-out infinite; }
.voice-duration { font-size: 22px; font-variant-numeric: tabular-nums; }
.voice-capture-status small, .voice-transcript-review small { color: var(--text-secondary); line-height: 1.7; }
.voice-capture-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.voice-transcript-review { display: grid; min-width: 0; gap: 10px; }
.voice-transcript-review label { font-size: 14px; font-weight: var(--weight-strong); }
.voice-transcript-review textarea { width: 100%; min-height: 150px; resize: vertical; line-height: 1.8; }
.voice-transcript-review > .app-button { justify-self: end; }
@keyframes recording-pulse { 50% { box-shadow: 0 0 0 12px var(--accent-soft); } }
@media (prefers-reduced-motion: reduce) { .voice-capture-icon.is-recording { animation: none; } }
</style>
