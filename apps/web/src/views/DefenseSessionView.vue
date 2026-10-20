<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { judgeDefinitions, MAX_DEFENSE_QUESTIONS, questionTypeLabels } from '@defense/shared'
import { useDefenseStore } from '../stores/defense'
import DefenseMessages from '../components/defense/DefenseMessages.vue'
import AppButton from '../components/ui/AppButton.vue'
import AttachmentUploader from '../components/attachments/AttachmentUploader.vue'
import AttachmentGallery from '../components/attachments/AttachmentGallery.vue'
import JudgeRolePicker from '../components/judges/JudgeRolePicker.vue'
import JudgeAvatar from '../components/judges/JudgeAvatar.vue'
import DefenseSessionStatus from '../components/defense/DefenseSessionStatus.vue'
const uploading = ref(false)
const route = useRoute(),
  store = useDefenseStore()
const id = computed(() => String(route.params.id ?? ''))
const current = computed(() =>
  store.session?.messages.find((v) => v.id === store.session?.currentQuestionId),
)
const judge = computed(() => judgeDefinitions.find((v) => v.id === store.session?.currentJudgeId))
const questions = computed(
  () => store.session?.messages.filter((v) => v.sender === 'judge').length ?? 0,
)
const blocked = computed(() => store.busy || store.session?.status === 'generating')
const answers = computed(
  () => store.session?.messages.filter((message) => message.sender === 'user').length ?? 0,
)
const activity = computed(() =>
  !blocked.value
    ? null
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
  activity.value === 'generating' ? 'generating' : (store.session?.status ?? 'ready'),
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
  <RouterLink to="/defense" class="back-link">← 返回答辩准备</RouterLink>
  <div class="view-heading">
    <div class="eyebrow">DYNAMIC DEFENSE</div>
    <h1>{{ store.session?.project.name ?? '恢复答辩会话' }}</h1>
    <p>根据你的回答继续追问，记录每次推敲。</p>
  </div>
  <p v-if="store.error" class="notice notice-error" role="alert">{{ store.error }}</p>
  <p v-if="store.warning" class="notice" role="status">{{ store.warning }}</p>
  <AppButton v-if="!store.session" :disabled="store.busy" @click="store.load(id)">{{
    store.busy ? '读取中…' : '重试读取会话'
  }}</AppButton>
  <template v-if="store.session">
    <DefenseSessionStatus
      :mode="store.session.mode"
      :status="displayStatus"
      :questions="questions"
      :answers="answers"
    />
    <section v-if="store.session.training" class="defense-current">
      <h2>本次训练重点</h2>
      <p>基于上一场已保存报告，不预设本次成绩。</p>
      <ul>
        <li v-for="focus in store.session.training.focus" :key="focus">{{ focus }}</li>
      </ul>
    </section>
    <section class="current-question-card" aria-label="当前问题">
      <div class="current-question-header">
        <JudgeAvatar :id="store.session.currentJudgeId" />
        <div>
          <span>当前评委</span>
          <h2>{{ judge?.name }}</h2>
        </div>
        <span v-if="current?.question" class="question-type-chip">{{
          questionTypeLabels[current.question.questionType]
        }}</span>
      </div>
      <p v-if="current?.question" class="current-question-text">{{ current.content }}</p>
      <p v-else class="current-question-placeholder">
        {{
          store.session.status === 'failed'
            ? '首问生成失败，请重试上次操作。'
            : store.session.status === 'ended'
              ? '本场答辩未生成问题。'
              : '正在准备本轮的第一个问题。'
        }}
      </p>
      <p class="current-judge-perspective">{{ judge?.introduction }}</p>
    </section>
    <details v-if="store.session.project.attachments?.length" class="history-card">
      <summary>本项目附带的图片与文档</summary>
      <AttachmentGallery :items="store.session.project.attachments" />
    </details>
    <JudgeRolePicker
      :model-value="store.session.currentJudgeId"
      label="评委席 · 选择不同视角"
      active
      :disabled="
        blocked ||
        uploading ||
        !!store.operation ||
        store.session.status !== 'awaiting_answer' ||
        questions >= MAX_DEFENSE_QUESTIONS
      "
      @update:model-value="store.switchJudge"
    />
    <p class="judge-disclaimer">
      切换评委会保留记录并将当前未作答问题标记为跳过。回答分析与风险为模型判断，仍需核实。
    </p>
    <DefenseMessages
      :messages="store.session.messages"
      :demo="store.session.mode === 'demo'"
      :activity="activity"
      :judge-id="activeJudgeId"
    />
    <div v-if="store.session.status !== 'ended'" class="defense-composer">
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
      <AttachmentUploader
        :model-value="store.draftAttachments"
        :disabled="blocked || !!store.operation || store.session.status !== 'awaiting_answer'"
        label="为本次回答补充图片与文档"
        @update:model-value="store.updateAttachments"
        @busy="uploading = $event"
      />
      <div class="defense-actions">
        <AppButton
          v-if="store.session.status === 'awaiting_answer' && !store.operation"
          :disabled="blocked || uploading || !store.draft.trim()"
          :busy="store.busy"
          @click="store.answer"
          >提交回答并追问</AppButton
        ><AppButton
          v-if="store.operation && !store.busy && store.session.status !== 'generating'"
          :disabled="blocked"
          @click="store.retry"
          >重试上次操作</AppButton
        ><AppButton
          v-if="store.session.status === 'ready' && !store.operation"
          :disabled="blocked"
          @click="store.initial"
          >生成首问</AppButton
        ><AppButton variant="secondary" :disabled="blocked || uploading" @click="store.end"
          >结束答辩并保存</AppButton
        ><AppButton variant="ghost" :disabled="store.busy || uploading" @click="store.load(id)"
          >刷新会话状态</AppButton
        >
      </div>
      <p class="judge-disclaimer">
        提交失败会保留输入和原请求。若回答已保存，请使用“重试上次操作”，避免产生重复回答。
      </p>
    </div>
    <div v-else class="defense-ended">
      <h2>答辩已结束，完整记录已保存。</h2>
      <RouterLink :to="{ name: 'defense-report', params: { id } }" class="app-button button-primary"
        >查看诊断报告 →</RouterLink
      >
    </div>
  </template>
</template>
