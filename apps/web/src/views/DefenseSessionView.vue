<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, PanelRight, Settings } from 'lucide-vue-next'
import { judgeDefinitions, trainingSettings, questionTypeLabels } from '@defense/shared'
import { useDefenseStore } from '../stores/defense'
import DefenseMessages from '../components/defense/DefenseMessages.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppDialog from '../components/ui/AppDialog.vue'
import DefenseChatComposer from '../components/defense/DefenseChatComposer.vue'
import AttachmentGallery from '../components/attachments/AttachmentGallery.vue'
import JudgeRolePicker from '../components/judges/JudgeRolePicker.vue'
import JudgeAvatar from '../components/judges/JudgeAvatar.vue'
import AnswerFeedback from '../components/defense/AnswerFeedback.vue'
import TrainingSummary from '../components/defense/TrainingSummary.vue'
import { useDefenseDraftGuard } from '../composables/useDefenseDraftGuard'
import DiscussionBoard from '../components/defense/DiscussionBoard.vue'
import DiscussionSummary from '../components/defense/DiscussionSummary.vue'
import EndDefenseControl from '../components/defense/EndDefenseControl.vue'
import RequestWait from '../components/ui/RequestWait.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
const uploading = ref(false), showTools = ref(false)
const route = useRoute(),
  store = useDefenseStore()
useDefenseDraftGuard()
const id = computed(() => String(route.params.id ?? ''))
const current = computed(() =>
  store.session?.messages.find((v) => v.id === store.session?.currentQuestionId),
)
const judge = computed(() => judgeDefinitions.find((v) => v.id === store.session?.currentJudgeId))
const limit = computed(() => store.session ? trainingSettings(store.session).questionLimit : 30)
const helpRecords = computed(() => store.session?.assistance?.filter(v => v.questionId === current.value?.id) ?? [])
const questions = computed(
  () => store.session?.messages.filter((v) => v.sender === 'judge').length ?? 0,
)
const blocked = computed(() => store.busy || store.session?.status === 'generating')
const answers = computed(
  () => store.session?.messages.filter((message) => message.sender === 'user').length ?? 0,
)
const activity = computed(() =>
  !blocked.value || store.operation?.kind === 'help'
    ? null
    : questions.value >= limit.value && (store.operation?.kind === 'answer' || store.session?.pending?.type === 'answer')
      ? 'reviewing'
    : store.session?.status === 'generating' || store.session?.status === 'ready' || store.operation
      ? 'generating'
      : 'processing',
)
const activeJudgeId = computed(
  () =>
    store.session?.pending?.judgeId ??
    (store.operation?.kind === 'judge'
      ? store.operation.body.judgeId
      : store.session?.currentJudgeId) ??
    'business',
)
let poll: ReturnType<typeof setInterval> | undefined
watch(
  id,
  async (value, _previous, onCleanup) => {
    showTools.value = false
    let active = true
    onCleanup(() => {
      active = false
    })
    await store.load(value)
    if (
      active &&
      id.value === value &&
      store.session?.id === value &&
      store.session.status === 'ready' &&
      !store.error
    )
      await store.initial()
  },
  { immediate: true },
)
watch(
  () => store.session?.status,
  (status) => {
    clearInterval(poll)
    if (status === 'generating')
      poll = setInterval(() => {
        if (!store.busy) void store.load(id.value)
      }, 4000)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  clearInterval(poll)
  store.leave()
})
</script>
<template>
  <div class="session-page session-chat-page">
    <header class="chat-page-heading">
      <RouterLink to="/defense" class="back-link" aria-label="返回答辩准备"><ArrowLeft :size="15" /><span>返回答辩准备</span></RouterLink>
      <h1 v-if="!store.session">恢复答辩会话</h1>
      <RouterLink to="/settings" class="chat-model-settings app-button button-secondary" aria-label="模型与系统设置"><Settings :size="16" /></RouterLink>
    </header>
    <template v-if="!store.session">
      <StatusNotice v-if="store.error" tone="error" title="会话读取未完成">{{ store.error }}</StatusNotice>
      <StatusNotice v-if="store.busy" busy>正在恢复已保存的对话…</StatusNotice>
      <AppButton :disabled="store.busy" @click="store.load(id)">{{ store.busy ? '读取中…' : '重试读取会话' }}</AppButton>
    </template>
    <div v-else class="session-chat-workspace">
      <section class="session-chat-column" aria-label="答辩对话工作区">
        <div class="chat-conversation-heading">
          <div class="chat-judge-context">
            <JudgeAvatar :id="store.session.currentJudgeId" :size="18" />
            <div><h2>{{ judge?.name }}</h2><p>{{ store.session.status === 'ended' ? '本场已结束 · 完整对话已保存' : current?.question ? questionTypeLabels[current.question.questionType] + ' · 一次聊清一个问题' : '准备开始对话' }}</p></div>
            <AppButton variant="ghost" :aria-expanded="showTools" aria-controls="session-chat-tools" aria-haspopup="dialog" @click="showTools = true"><PanelRight :size="15" />{{ store.session.status === 'ended' ? '训练设置' : '切换评委' }}</AppButton>
          </div>
          <h1 class="chat-project-title">{{ store.session.project.name }}</h1>
          <div class="chat-conversation-status">
            <span class="chat-source-label" :class="store.session.mode">{{ store.session.mode === 'demo' ? '模拟演示 · 未调用模型' : '真实模型会话' }}</span>
            <span class="chat-turn-count">{{ answers }} 次回答 · {{ questions }} / {{ limit }} 题</span>
            <EndDefenseControl v-if="store.session.status !== 'ended'" :disabled="blocked || uploading"
              :has-draft="!!store.draft.trim() || !!store.draftAttachments.length" :has-pending-answer="store.operation?.kind === 'answer'" @end="store.end" />
          </div>
        </div>
        <div id="session-history" class="chat-conversation" aria-labelledby="session-history-title">
          <h2 id="session-history-title" class="sr-only">本场对话记录</h2>
          <DefenseMessages :key="id" variant="chat" :messages="store.session.messages" :demo="store.session.mode === 'demo'"
            :current-question-id="store.session.status !== 'ended' ? store.session.currentQuestionId : null"
            :activity="activity" :judge-id="activeJudgeId" :assistance="store.session.assistance"
            :retryable-answer-id="store.session.status !== 'ended' ? store.session.pending?.answerMessageId ?? undefined : undefined">
            <template #activity><RequestWait embedded :active="blocked && !!store.operation && store.session.mode === 'live'" :request-key="store.operation?.body.requestId" /></template>
            <template #after-messages>
              <template v-if="store.session.status === 'ended'">
                <AnswerFeedback v-if="store.session.closingFeedback" :assessment="store.session.closingFeedback.assessment" :demo="store.session.mode === 'demo'" />
                <details class="chat-session-recap"><summary>回看讨论小结<ChevronDown :size="15" /></summary><DiscussionSummary :session="store.session" /></details>
                <details v-if="store.draft.trim() || store.draftAttachments.length" class="chat-session-recap">
                  <summary>查看保留的回答草稿<ChevronDown :size="15" /></summary>
                  <p>未提交的内容不计入本场记录，可以复制后继续整理。</p>
                  <textarea :value="store.draft" readonly rows="4" aria-label="结束时保留的回答草稿" />
                  <AttachmentGallery :items="store.draftAttachments" />
                </details>
              </template>
            </template>
          </DefenseMessages>
        </div>
        <div class="chat-compose-dock">
          <StatusNotice v-if="store.error" tone="error" title="本次操作未完成" compact>{{ store.error }}</StatusNotice>
          <StatusNotice v-if="store.warning" tone="warning" compact>{{ store.warning }}</StatusNotice>
          <DefenseChatComposer v-if="store.session.status !== 'ended'" :blocked="blocked" :questions="questions" :limit="limit" :help-records="helpRecords" @busy="uploading = $event" />
          <div v-else class="chat-ended-state">
            <CheckCircle2 :size="22" /><div><strong>这一轮，先到这里。</strong><p>已保存 {{ answers }} 次回答，可以继续回看对话。</p></div>
            <RouterLink :to="{ name: 'defense-report', params: { id } }" class="app-button button-primary">查看诊断报告<ArrowUpRight :size="16" /></RouterLink>
          </div>
        </div>
      </section>
      <AppDialog id="session-chat-tools" v-model="showTools" :title="store.session.status === 'ended' ? '训练设置' : '切换评委'" description="查看本场评委、议题进度、训练设置和项目材料。">
      <aside class="session-side session-chat-side" aria-label="评委与训练辅助">
        <section class="session-judge-panel surface-panel">
          <div class="session-judge-profile"><JudgeAvatar :id="store.session.currentJudgeId" /><div><h2>{{ judge?.name }}</h2><span>{{ store.session.status === 'ended' ? '最后对话的评委' : '正在与你对话' }}</span></div></div>
          <p>{{ judge?.introduction }}</p>
          <details v-if="store.session.status !== 'ended'" class="session-tools session-judge-switch" open>
            <summary><span>切换评委 · 当前 {{ judge?.name }}</span><ChevronDown :size="16" /></summary>
            <p>切换会生成新问题并计入题数，当前未回答的问题会保留为已跳过。</p>
            <JudgeRolePicker :model-value="store.session.currentJudgeId" label="选择下一位评委" active
              :disabled="blocked || uploading || !!store.operation || store.session.status !== 'awaiting_answer' || questions >= limit" @update:model-value="store.switchJudge" />
          </details>
        </section>
        <DiscussionBoard :session="store.session" :disabled="blocked || uploading || !!store.operation" :question-limit-reached="questions >= limit" :read-only="store.session.status === 'ended'" @update="store.updateTopic" @focus="store.changeTopic" />
        <details class="session-tools session-settings surface-panel"><summary><span>训练设置与项目附件</span><ChevronDown :size="16" /></summary>
          <TrainingSummary :session="store.session" />
          <section v-if="store.session.training" class="session-training-focus"><h3>本次训练重点</h3><p>基于上一场已保存报告，不预设本次成绩。</p><ul><li v-for="focus in store.session.training.focus" :key="focus">{{ focus }}</li></ul></section>
          <AttachmentGallery v-if="store.session.project.attachments?.length" :items="store.session.project.attachments" />
        </details>
        <AppButton variant="secondary" :disabled="store.busy || uploading" @click="store.load(id)">刷新会话状态</AppButton>
      </aside>
      </AppDialog>
    </div>
  </div>
</template>
