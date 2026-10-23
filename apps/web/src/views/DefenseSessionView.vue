<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowDown, ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, MessagesSquare } from 'lucide-vue-next'
import { judgeDefinitions, trainingSettings, questionTypeLabels } from '@defense/shared'
import { useDefenseStore } from '../stores/defense'
import DefenseMessages from '../components/defense/DefenseMessages.vue'
import AppButton from '../components/ui/AppButton.vue'
import AttachmentUploader from '../components/attachments/AttachmentUploader.vue'
import AttachmentGallery from '../components/attachments/AttachmentGallery.vue'
import JudgeRolePicker from '../components/judges/JudgeRolePicker.vue'
import JudgeAvatar from '../components/judges/JudgeAvatar.vue'
import DefenseSessionStatus from '../components/defense/DefenseSessionStatus.vue'
import AssistancePanel from '../components/defense/AssistancePanel.vue'
import AnswerFeedback from '../components/defense/AnswerFeedback.vue'
import TrainingSummary from '../components/defense/TrainingSummary.vue'
import { useDefenseDraftGuard } from '../composables/useDefenseDraftGuard'
import { latestAnswerFeedback } from '../utils/defense-feedback'
import DiscussionBoard from '../components/defense/DiscussionBoard.vue'
import DiscussionSummary from '../components/defense/DiscussionSummary.vue'
import DefenseActivity from '../components/defense/DefenseActivity.vue'
import EndDefenseControl from '../components/defense/EndDefenseControl.vue'
import RequestWait from '../components/ui/RequestWait.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
const uploading = ref(false)
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
const feedback = computed(() => latestAnswerFeedback(store.session, store.operation?.kind === 'answer'))
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
const displayStatus = computed(() =>
  activity.value === 'generating' || activity.value === 'reviewing' ? 'generating' : (store.session?.status ?? 'ready'),
)
let poll: ReturnType<typeof setInterval> | undefined
watch(
  id,
  async (value, _previous, onCleanup) => {
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
  <div class="session-page">
  <RouterLink to="/defense" class="back-link"><ArrowLeft :size="16" /> 返回答辩准备</RouterLink>
  <header class="session-page-heading">
    <div>
      <h1>{{ store.session?.project.name ?? '恢复答辩会话' }}</h1>
      <p>{{ store.session?.status === 'ended' ? '回看这一轮的发现，带着改进方向继续准备。' : '一次聊清一个问题。先说出想法，再和评委一起完善。' }}</p>
    </div>
    <a v-if="store.session" href="#session-history" class="app-button button-secondary session-history-link"><MessagesSquare :size="17" />查看本场记录<ArrowDown :size="15" /></a>
  </header>
  <StatusNotice v-if="store.error" tone="error" title="本次操作未完成">{{ store.error }}</StatusNotice>
  <StatusNotice v-if="store.warning" tone="warning" compact>{{ store.warning }}</StatusNotice>
  <AppButton v-if="!store.session" :disabled="store.busy" @click="store.load(id)">{{
    store.busy ? '读取中…' : '重试读取会话'
  }}</AppButton>
  <template v-if="store.session">
    <DefenseSessionStatus
      :mode="store.session.mode"
      :status="displayStatus"
      :questions="questions"
      :answers="answers"
      :limit="limit"
    />
    <div class="session-workspace-grid">
    <div class="session-primary">
    <section v-if="store.session.status !== 'ended'" id="session-question" class="current-question-card surface-panel" aria-label="当前问题">

      <div class="session-card-eyebrow"><span>当前问题</span><span v-if="questions">第 {{ questions }} 题</span></div>
      <div class="current-question-header">
        <JudgeAvatar :id="store.session.currentJudgeId" />
        <div>
          <span>由评委向你提问</span>
          <h2>{{ judge?.name }}</h2>
        </div>
        <span v-if="current?.question" class="question-type-chip">{{
          questionTypeLabels[current.question.questionType]
        }}</span>
      </div>
      <Transition name="ink-reveal" mode="out-in">
      <p v-if="current?.question" :key="current.id" class="current-question-text">{{ current.content }}</p>
      <p v-else key="waiting" class="current-question-placeholder">
        {{
          store.session.status === 'failed'
            ? '首问生成失败，请重试上次操作。'
            : '正在准备本轮的第一个问题。'
        }}
      </p>
      </Transition>
    </section>
    <AnswerFeedback v-if="feedback && store.session.status !== 'ended'" :assessment="feedback.assessment" :demo="store.session.mode === 'demo'" :rationale="feedback.rationale" />
    <DefenseActivity v-if="activity" :judge-id="activeJudgeId" :phase="activity" :has-messages="!!questions" :demo="store.session.mode === 'demo'">
      <RequestWait embedded :active="blocked && !!store.operation && store.session.mode === 'live'" :request-key="store.operation?.body.requestId" />
    </DefenseActivity>
    <div v-if="store.session.status !== 'ended'" class="defense-composer surface-panel">

      <div class="session-composer-heading"><h2>说说你的想法</h2><span>不必一次答得完美</span></div>
      <label for="defense-answer"
        >你的回答 <span>{{ store.draft.length }} / 4000</span></label
      >
      <textarea
        id="defense-answer"
        :value="store.draft"
        maxlength="4000"
        rows="5"
        :disabled="blocked || !!store.operation || store.session.status !== 'awaiting_answer'"
        placeholder="说明你的判断和依据；附图时请解释图中要证明的内容…"
        @input="store.updateDraft(($event.target as HTMLTextAreaElement).value)"
      />
      <p class="session-input-hint">可以从一个具体例子开始。暂时没有数据，也可以说明准备怎样验证。</p>
      <details class="session-answer-materials" :open="store.draftAttachments.length > 0 || undefined">
        <summary >补充图片或文档<span>{{ store.draftAttachments.length ? store.draftAttachments.length + ' 份附件' : '可选' }}</span><ChevronDown :size="16" /></summary>
        <AttachmentUploader
        :model-value="store.draftAttachments"
        :disabled="blocked || !!store.operation || store.session.status !== 'awaiting_answer'"
        label="为本次回答补充图片与文档"
        @update:model-value="store.updateAttachments"
        @busy="uploading = $event"
      />
      </details>
      <div class="defense-actions">
        <AppButton
          v-if="store.session.status === 'awaiting_answer' && !store.operation"
          :disabled="blocked || uploading || !store.draft.trim()"
          :busy="store.busy"
          @click="store.answer"
          >{{ questions >= limit ? '提交最后回答并结束' : '提交回答并追问' }}</AppButton
        ><AppButton
          v-if="store.operation && store.operation.kind !== 'help' && !store.busy && store.session.status !== 'generating'"
          :disabled="blocked"
          @click="store.retry"
          >重试上次操作</AppButton
        ><AppButton
          v-if="store.session.status === 'ready' && !store.operation"
          :disabled="blocked"
          @click="store.initial"
          >生成首问</AppButton
        ><AppButton variant="ghost" :disabled="store.busy || uploading" @click="store.load(id)"
          >刷新会话状态</AppButton
        >
      </div>
      <p v-if="store.operation?.kind !== 'help'" class="judge-disclaimer">
        提交失败会保留输入和原请求。若回答已保存，请使用“重试上次操作”，避免产生重复回答。
      </p>
      <AssistancePanel v-if="store.session.status === 'awaiting_answer'" :records="helpRecords"
        :disabled="blocked || uploading || !!store.operation" :loading="store.busy && store.operation?.kind === 'help'"
        :failed="!store.busy && store.operation?.kind === 'help'" :demo="store.session.mode === 'demo'"
        @help="store.help" @retry="store.retry" @cancel="store.cancelHelp" />
      <EndDefenseControl :disabled="blocked || uploading" :has-draft="!!store.draft.trim() || !!store.draftAttachments.length" :has-pending-answer="store.operation?.kind === 'answer'" @end="store.end" />
    </div>
    <div v-else class="defense-ended surface-panel">

      <div class="session-ended-heading"><span><CheckCircle2 :size="28" /></span><div><div class="eyebrow">本场已保存</div><h2>这一轮，先到这里。</h2></div></div>
      <p class="session-ended-copy">答辩已结束，完整记录已保存。共留下 {{ answers }} 次回答，可以回看讨论小结，或进入报告查看下一步建议。</p>
      <div class="session-ended-actions">
      <RouterLink :to="{ name: 'defense-report', params: { id } }" class="app-button button-primary control-button"
        >
      查看诊断报告<ArrowUpRight :size="17" /></RouterLink
      >
      <a href="#session-history" class="app-button button-secondary">回看完整对话</a>
      </div>
      <DiscussionSummary :session="store.session" />
      <details v-if="store.draft.trim() || store.draftAttachments.length" class="history-card surface-panel">
        <summary >查看保留的回答草稿</summary>

        <p>以下内容不因结束操作而追加到会话；已经提交的回答请以下方记录为准。</p>
        <textarea  :value="store.draft" readonly rows="5" aria-label="结束时保留的回答草稿" />
        <AttachmentGallery :items="store.draftAttachments" />
      </details>
    </div>
    <AnswerFeedback v-if="feedback && store.session.status === 'ended'" :assessment="feedback.assessment" :demo="store.session.mode === 'demo'" :rationale="feedback.rationale" />
    </div>
    <aside class="session-side" aria-label="评委与训练辅助">
    <section class="session-judge-panel surface-panel">

      <div class="session-side-heading"><span class="section-kicker">{{ store.session.status === 'ended' ? '最后对话的评委' : '正在与你对话' }}</span></div>
      <div class="session-judge-profile"><JudgeAvatar :id="store.session.currentJudgeId" /><div><h2>{{ judge?.name }}</h2><span>{{ store.session.status === 'ended' ? '本场记录已保留' : '换个视角，发现新的思路' }}</span></div></div>
      <p>{{ judge?.introduction }}</p>
    <details v-if="store.session.status !== 'ended'" class="session-tools session-judge-switch">
      <summary ><span>切换评委 · 当前 {{ judge?.name }}</span><ChevronDown :size="16" /></summary>
      <p>换个视角继续讨论。切换会生成新问题并计入题数，当前未回答的问题会保留为已跳过。</p>
      <JudgeRolePicker :model-value="store.session.currentJudgeId" label="选择下一位评委" active
        :disabled="blocked || uploading || !!store.operation || store.session.status !== 'awaiting_answer' || questions >= limit" @update:model-value="store.switchJudge" />
    </details>
    </section>
    <DiscussionBoard :session="store.session" :disabled="blocked || uploading || !!store.operation" :question-limit-reached="questions >= limit" :read-only="store.session.status === 'ended'" @update="store.updateTopic" @focus="store.changeTopic" />
    <details class="session-tools session-settings surface-panel"><summary ><span>训练设置与项目附件</span><ChevronDown :size="16" /></summary>

      <TrainingSummary :session="store.session" />
      <section v-if="store.session.training" class="session-training-focus">
        <h3>本次训练重点</h3>
        <p>基于上一场已保存报告，不预设本次成绩。</p>
        <ul><li v-for="focus in store.session.training.focus" :key="focus">{{ focus }}</li></ul>
      </section>
      <AttachmentGallery v-if="store.session.project.attachments?.length" :items="store.session.project.attachments" />
    </details>
    </aside>
    </div>
    <section id="session-history" class="session-history" aria-labelledby="session-history-title">
    <div class="session-history-heading"><div><span class="section-kicker">回看你的思考过程</span><h2 id="session-history-title">本场对话记录 <span>{{ answers }} 次回答</span></h2><p>按原始顺序保留问题、回答、附件与反馈。</p></div><a v-if="store.session.status !== 'ended'" href="#session-question" class="text-button">返回当前问题 ↑</a></div>
    <DefenseMessages :messages="store.session.messages" :demo="store.session.mode === 'demo'" :assistance="store.session.assistance"
      :retryable-answer-id="store.session.status !== 'ended' ? store.session.pending?.answerMessageId ?? undefined : undefined" />
    </section>
  </template>
  </div>
</template>
