<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  judgeDefinitions,
  questionTypeLabels,
  answerEvaluationLabels,
  severityLabels,
  type DefenseMessage,
  type AssistanceRecord,
  assistanceKindLabels,
} from '@defense/shared'
import AttachmentGallery from '../attachments/AttachmentGallery.vue'
import DefenseActivity from './DefenseActivity.vue'
import JudgeAvatar from '../judges/JudgeAvatar.vue'
import { ArrowDown, UserRound } from 'lucide-vue-next'
import AnswerFeedback from './AnswerFeedback.vue'
import { useConversationScroll } from '../../composables/useConversationScroll'
const props = withDefaults(
  defineProps<{
    messages: DefenseMessage[]
    demo: boolean
    activity?: 'generating' | 'processing' | 'reviewing' | null
    judgeId?: import('@defense/shared').JudgeId
    assistance?: AssistanceRecord[]
    retryableAnswerId?: string
    variant?: 'record' | 'chat'
    currentQuestionId?: string | null
  }>(),
  { activity: null, judgeId: 'business', variant: 'record' },
)
const feed = ref<HTMLElement | null>(null), revealIncoming = ref(false)
const { following, unread, onScroll, jumpToLatest } = useConversationScroll(feed,
  () => props.messages.map(message => message.id).join(',') + ':' + (props.activity ?? ''))
watch(
  () => ({ ids: props.messages.map((message) => message.id), activity: props.activity }),
  (current, previous) => {
    // Reveal complete server responses, never replay saved history as a simulated token stream.
    revealIncoming.value = !!previous.activity && current.ids.some((id) => !previous.ids.includes(id))
  },
)
const judgeName = (id: string) => judgeDefinitions.find((v) => v.id === id)?.name
</script>
<template>
  <div class="defense-feed" :class="{ 'chat-feed': variant === 'chat' }">
  <div
    ref="feed"
    class="defense-messages"
    role="log"
    aria-label="答辩消息记录"
    aria-live="polite"
    :aria-busy="!!activity"
    tabindex="0"
    @scroll="onScroll"
  >
    <div v-if="!messages.length && !activity" class="conversation-empty">
      <span class="conversation-empty-mark">AI</span><strong>对话，即将开始</strong>
      <p>生成首问后，评委的问题会显示在这里。</p>
    </div>
    <TransitionGroup name="ink-reveal" :css="revealIncoming" tag="div" class="defense-message-list">
    <article
      v-for="message in messages"
      :key="message.id"
      :id="message.sender === 'user' ? 'answer-' + message.id : variant === 'chat' && message.id === currentQuestionId ? 'session-question' : undefined"
      class="defense-message"
      :class="[message.sender, { 'is-current': variant === 'chat' && message.id === currentQuestionId }]"
      :aria-label="variant === 'chat' && message.id === currentQuestionId ? '当前问题' : undefined"
    >
      <span v-if="variant === 'chat'" class="chat-message-avatar" aria-hidden="true">
        <JudgeAvatar v-if="message.sender === 'judge'" :id="message.judgeId" :size="18" />
        <UserRound v-else :size="18" />
      </span>
      <div class="defense-message-body">
      <div class="defense-message-meta">
        <strong>{{ message.sender === 'user' ? '我的回答' : judgeName(message.judgeId) }}</strong
        ><time :datetime="message.createdAt">{{
          new Date(message.createdAt).toLocaleTimeString('zh-CN')
        }}</time
        ><span v-if="demo">模拟会话</span
        ><span v-if="message.question"
          >{{ questionTypeLabels[message.question.questionType] }} ·
          {{ severityLabels[message.question.riskLevel] }}</span
        >
        <span v-if="variant === 'chat' && message.id === currentQuestionId" class="chat-current-label">{{ message.status === 'answered' ? '已回答' : message.status === 'superseded' ? '已跳过' : '当前问题' }}</span>
      </div>
      <AnswerFeedback v-if="variant === 'chat' && message.assessment" :assessment="message.assessment" :demo="demo" :rationale="message.question?.rationale" />
      <p class="defense-message-content">{{ message.content }}</p>
      <AttachmentGallery v-if="message.attachments?.length" :items="message.attachments" />
      <p v-if="message.status === 'pending'">回答已保存，正在生成追问…</p>
      <p v-if="message.status === 'failed'" class="defense-source">
        {{ message.id === retryableAnswerId
          ? '追问未完成；回答已保存在服务端，可通过“重试上次操作”继续。'
          : '该回答已保存，但逐轮评价未完成；记录保留，不补造反馈。' }}
      </p>
      <p v-if="message.status === 'superseded'">已切换评委或议题，本题未作答。</p>
      <details v-for="help in assistance?.filter(v => v.questionId === message.id)" :key="help.requestId" class="saved-assistance">
        <summary >{{ assistanceKindLabels[help.kind] }} · {{ help.mode === 'demo' ? '模拟提示' : '系统辅助记录' }}</summary>
        <p>{{ help.content }}</p><small>提示不属于用户回答，不作为用户已提供的证据。</small>
      </details>
      <details v-if="message.assessment && variant === 'record'">
        <summary>
          回答分析 · {{ answerEvaluationLabels[message.assessment.evaluation]
          }}{{ demo ? '（模拟）' : '' }}
        </summary>
        <p>回答依据：「{{ message.assessment.answerQuote }}」</p>
        <p>{{ message.assessment.feedback }}</p>
        <p v-for="risk in message.assessment.risks" :key="risk.title" class="defense-source">
          待验证风险：{{ risk.title }}
        </p>
      </details>
      </div>
    </article>
    </TransitionGroup>
    <DefenseActivity
      v-if="activity"
      :judge-id="judgeId"
      :phase="activity"
      :has-messages="messages.length > 0"
      :demo="demo"
    ><template v-if="$slots.activity" #default><slot name="activity" /></template></DefenseActivity>
    <slot name="after-messages" />
  </div>
  <button v-if="!following" type="button" class="chat-jump-latest control-button" @click="jumpToLatest"><ArrowDown :size="15" />{{ unread ? '有新消息，回到最新' : '回到最新消息' }}</button>
  </div>
</template>
