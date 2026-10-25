<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { ArrowUp, Plus, Lightbulb, LoaderCircle, Mic } from 'lucide-vue-next'
import type { AssistanceRecord } from '@defense/shared'
import { useDefenseStore } from '../../stores/defense'
import { isAnswerShortcut } from '../../utils/defense-chat'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import AttachmentUploader from '../attachments/AttachmentUploader.vue'
import AssistancePanel from './AssistancePanel.vue'
import DefenseProgressMenu from './DefenseProgressMenu.vue'
import VoiceAnswerPanel from './VoiceAnswerPanel.vue'
import { voicePlayback } from '../../composables/useVoicePlayback'

const props = defineProps<{ blocked: boolean; questions: number; limit: number; helpRecords: AssistanceRecord[] }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const store = useDefenseStore()
const uploading = ref(false)
const attachmentsOpen = ref(false), helpOpen = ref(false), voiceOpen = ref(false), dialogId = useId()
const voiceContext = computed(() => [store.session?.id, store.session?.currentQuestionId, store.session?.currentJudgeId, store.session?.status].join(':'))
const canSubmit = computed(() => store.session?.status === 'awaiting_answer'
  && !props.blocked && !store.busy && !store.operation && !uploading.value && !voiceOpen.value && !!store.draft.trim())
const voiceDisabled = computed(() => props.blocked || store.busy || !!store.operation || uploading.value || store.session?.status !== 'awaiting_answer')
watch([voiceOpen, uploading], () => { emit('busy', voiceOpen.value || uploading.value); voicePlayback.setRecording(voiceOpen.value) }, { flush: 'sync' })
watch(voiceContext, () => { voiceOpen.value = false; voicePlayback.stop() }, { flush: 'sync' })
onBeforeUnmount(() => { voicePlayback.setRecording(false); emit('busy', false) })
function uploadBusy(value: boolean) { uploading.value = value }
function acceptVoice(text: string) { if (!voiceDisabled.value) { store.updateDraft(text); voiceOpen.value = false } }
function submit() { if (canSubmit.value) void store.answer() }
function onKeydown(event: KeyboardEvent) {
  if (!isAnswerShortcut(event)) return
  event.preventDefault()
  submit()
}
</script>
<template>
  <div class="chat-composer">
    <form class="chat-compose-form" @submit.prevent="submit">
      <label for="defense-answer" class="sr-only">你的回答，最多 4000 字</label>
      <textarea id="defense-answer" :value="store.draft" maxlength="4000" rows="2"
        :disabled="blocked || voiceOpen || !!store.operation || store.session?.status !== 'awaiting_answer'"
        aria-describedby="chat-compose-hint" placeholder="说说你的想法，可以从一个具体例子开始…"
        @input="store.updateDraft(($event.target as HTMLTextAreaElement).value)" @keydown="onKeydown" />
      <div class="chat-submit-row">
        <div class="chat-input-tools">
          <button type="button" class="chat-tool-button chat-attach-trigger" :aria-expanded="attachmentsOpen" :aria-controls="dialogId + '-attachments'" aria-label="补充图片或文档" title="补充图片或文档" @click="attachmentsOpen = true">
            <LoaderCircle v-if="uploading" :size="18" class="spinning" /><Plus v-else :size="20" /><span v-if="store.draftAttachments.length">{{ store.draftAttachments.length }}</span>
          </button>
          <button v-if="store.session?.status === 'awaiting_answer'" type="button" class="chat-tool-button" :disabled="voiceDisabled" :aria-expanded="voiceOpen" :aria-controls="dialogId + '-voice'" aria-haspopup="dialog" aria-label="语音回答" title="语音回答" @click="voiceOpen = true"><Mic :size="17" /><span>语音</span></button>
          <button v-if="store.session?.status === 'awaiting_answer'" type="button" class="chat-tool-button" :aria-expanded="helpOpen" :aria-controls="dialogId + '-help'" @click="helpOpen = true">
            <LoaderCircle v-if="store.busy && store.operation?.kind === 'help'" :size="16" class="spinning" /><Lightbulb v-else :size="16" />{{ store.busy && store.operation?.kind === 'help' ? '提示生成中…' : '帮我想一想' }}
          </button>
        </div>
        <div class="chat-input-status">
          <DefenseProgressMenu v-if="store.session" :session="store.session" :questions="questions" :limit="limit" :busy="blocked || store.busy" />
          <AppButton v-if="store.session?.status === 'awaiting_answer' && !store.operation" type="submit" class="chat-send-button"
            :aria-label="questions >= limit ? '提交最后回答并结束' : '发送回答'" :title="questions >= limit ? '提交最后回答并结束' : '发送回答'"
            :disabled="!canSubmit" :busy="store.busy"><ArrowUp :size="19" /></AppButton>
          <AppButton v-if="store.operation && store.operation.kind !== 'help' && !store.busy && store.session?.status !== 'generating'"
            :disabled="blocked || uploading" @click="store.retry">重试上次操作</AppButton>
          <AppButton v-if="store.session?.status === 'ready' && !store.operation" :disabled="blocked || uploading" @click="store.initial">生成首问</AppButton>
        </div>
      </div>
    </form>
    <div class="chat-compose-hints"><span id="chat-compose-hint">Enter 发送 · Shift + Enter 换行</span><span>{{ store.draft.length }} / 4000</span></div>
    <p class="chat-compose-note">{{ store.operation && store.operation.kind !== 'help'
      ? '请求未完成时保留原输入，请使用重试入口，避免重复提交回答。'
      : 'AI 反馈仅供训练参考。暂时没有数据，也可以说说准备怎样验证。' }}</p>
    <AppDialog :id="dialogId + '-attachments'" v-model="attachmentsOpen" title="补充图片或文档" description="上传的材料先加入回答草稿，发送回答时再提供给评委。关闭窗口不会取消正在处理的附件。">
      <AttachmentUploader :model-value="store.draftAttachments"
        :disabled="blocked || !!store.operation || store.session?.status !== 'awaiting_answer'"
        label="为本次回答补充图片与文档" @update:model-value="store.updateAttachments" @busy="uploadBusy" />
      <template #footer><AppButton variant="secondary" @click="attachmentsOpen = false">返回回答</AppButton></template>
    </AppDialog>
    <AppDialog :id="dialogId + '-help'" v-model="helpOpen" title="帮我想一想" description="选择一种提示，帮助你理清思路；提示不会替你提交回答。">
      <AssistancePanel v-if="store.session" :records="helpRecords" :disabled="blocked || uploading || !!store.operation"
        :loading="store.busy && store.operation?.kind === 'help'" :failed="!store.busy && store.operation?.kind === 'help'"
        :demo="store.session.mode === 'demo'" @help="store.help" @retry="store.retry" @cancel="store.cancelHelp" />
      <template #footer><AppButton variant="secondary" @click="helpOpen = false">返回回答</AppButton></template>
    </AppDialog>
    <AppDialog :id="dialogId + '-voice'" v-model="voiceOpen" title="语音回答" description="录音、识别、核对，再加入回答草稿。">
      <VoiceAnswerPanel v-if="voiceOpen" :draft="store.draft" :context-key="voiceContext" :disabled="voiceDisabled" @confirm="acceptVoice" @cancel="voiceOpen = false" />
    </AppDialog>
  </div>
</template>
