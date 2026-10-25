<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Volume2, Square, LoaderCircle } from 'lucide-vue-next'
import type { DefenseMessage } from '@defense/shared'
import { voicePlayback } from '../../composables/useVoicePlayback'

const props = defineProps<{ message: DefenseMessage }>()
const { messageId, status, error, errorMessageId, recording } = voicePlayback
const active = computed(() => messageId.value === props.message.id)
const label = computed(() => active.value ? status.value === 'loading' ? '取消生成语音' : '停止朗读' : '朗读评委问题')
watch(() => [props.message.id, props.message.content], () => { if (active.value) voicePlayback.stop() })
onBeforeUnmount(() => { if (active.value) voicePlayback.stop() })
</script>
<template>
  <div class="judge-voice-control">
    <button type="button" class="chat-tool-button judge-voice-button" :disabled="recording"
      :aria-label="label" :aria-pressed="active" :title="recording ? '请先完成或取消语音回答' : 'AI 合成语音 · ' + label"
      @click="voicePlayback.play(message.id, message.judgeId, message.content)">
      <LoaderCircle v-if="active && status === 'loading'" :size="14" class="spinning" /><Square v-else-if="active" :size="14" /><Volume2 v-else :size="15" />
      <span>{{ active ? status === 'loading' ? '生成中 · 取消' : '停止朗读' : '朗读' }}</span>
    </button>
    <p v-if="errorMessageId === message.id && error" class="judge-voice-error" role="alert">{{ error }} <RouterLink to="/settings">语音设置</RouterLink></p>
  </div>
</template>
<style scoped>
.judge-voice-control { margin-top: 8px; }
.judge-voice-button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 5px 8px; color: var(--text-secondary); font-size: 12px; border: 0; border-radius: 8px; background: transparent; cursor: pointer; }
.judge-voice-button:hover:not(:disabled), .judge-voice-button[aria-pressed='true'] { color: var(--accent); background: var(--accent-soft); }
.judge-voice-button:disabled { opacity: .55; cursor: not-allowed; }
.judge-voice-error { color: var(--danger); font-size: 12px; line-height: 1.7; margin: 4px 0; }
</style>
