<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
  judgeDefinitions,
  questionTypeLabels,
  answerEvaluationLabels,
  severityLabels,
  type DefenseMessage,
} from '@defense/shared'
import AttachmentGallery from '../attachments/AttachmentGallery.vue'
import DefenseActivity from './DefenseActivity.vue'
const props = withDefaults(
  defineProps<{
    messages: DefenseMessage[]
    demo: boolean
    activity?: 'generating' | 'processing' | null
    judgeId?: import('@defense/shared').JudgeId
  }>(),
  { activity: null, judgeId: 'business' },
)
const feed = ref<HTMLElement | null>(null),
  follow = ref(true)
function onScroll() {
  if (feed.value)
    follow.value = feed.value.scrollHeight - feed.value.scrollTop - feed.value.clientHeight < 100
}
watch(
  () => [props.messages.length, props.activity],
  async () => {
    await nextTick()
    if (follow.value && feed.value) feed.value.scrollTop = feed.value.scrollHeight
  },
  { immediate: true },
)
const judgeName = (id: string) => judgeDefinitions.find((v) => v.id === id)?.name
</script>
<template>
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
    <article
      v-for="message in messages"
      :key="message.id"
      :id="message.sender === 'user' ? 'answer-' + message.id : undefined"
      class="defense-message"
      :class="message.sender"
    >
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
      </div>
      <p class="defense-message-content">{{ message.content }}</p>
      <AttachmentGallery v-if="message.attachments?.length" :items="message.attachments" />
      <p v-if="message.status === 'pending'">回答已保存，正在生成追问…</p>
      <p v-if="message.status === 'failed'" class="defense-source">
        追问未完成；该回答已保存在服务端，可重试。
      </p>
      <p v-if="message.status === 'superseded'">已切换评委，本题未作答。</p>
      <details v-if="message.assessment">
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
    </article>
    <DefenseActivity
      v-if="activity"
      :judge-id="judgeId"
      :phase="activity"
      :has-messages="messages.length > 0"
      :demo="demo"
    />
  </div>
</template>
