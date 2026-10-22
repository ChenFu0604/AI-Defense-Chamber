<script setup lang="ts">
import { computed, ref } from 'vue'
import { discussionStatusLabels, MAX_TOPIC_QUESTIONS, type DefenseSession, type DiscussionTopicId, type TopicStateRequest } from '@defense/shared'
import AppButton from '../ui/AppButton.vue'
const props = defineProps<{session: DefenseSession; disabled?: boolean; readOnly?: boolean}>()
const emit = defineEmits<{
  update: [input: Omit<TopicStateRequest, 'requestId'>]
  focus: [input: {topicId: DiscussionTopicId; expectedRevision: number}]
}>()
const editing = ref<DiscussionTopicId | null>(null), note = ref(''), status = ref<TopicStateRequest['status']>('paused'), error = ref(''), editRevision = ref(0)
const canEdit = computed(() => !props.readOnly && !props.disabled && props.session.status === 'awaiting_answer')
function edit(id: DiscussionTopicId) {
  editing.value = id; note.value = ''; status.value = 'paused'; error.value = ''
  editRevision.value = props.session.discussion!.revision
}
function save(id: DiscussionTopicId) {
  if (!note.value.trim()) {error.value = '请写一句更正原因，方便后续评委理解。'; return}
  emit('update', {topicId: id, status: status.value, note: note.value.trim(), expectedRevision: editRevision.value})
}
</script>
<template>
  <section v-if="session.discussion" class="discussion-board" aria-label="议题进度">
    <div class="discussion-heading"><div><span class="section-kicker">DISCUSSION MEMORY</span><h2>已经说清什么，还想继续聊什么？</h2></div><span>每次议题最多 {{ MAX_TOPIC_QUESTIONS }} 题</span></div>
    <p>这是训练提纲，不是评分。已澄清表示本场讨论清楚，不等于项目事实已获验证；你可以更正或重新打开。</p>
    <div class="discussion-chips"><span v-for="topic in session.discussion.topics" :key="topic.id" :class="topic.status">{{ topic.title }} · {{ discussionStatusLabels[topic.status] }}</span></div>
    <details class="discussion-details"><summary>查看议题依据与更正状态</summary>
    <div class="discussion-grid">
      <article v-for="topic in session.discussion.topics" :key="topic.id" class="discussion-topic" :class="[topic.status, {current: session.discussion.currentTopicId === topic.id}]">
        <div class="discussion-topic-heading"><h3>{{ topic.title }}</h3><span>{{ discussionStatusLabels[topic.status] }}</span></div>
        <small>{{ session.discussion.currentTopicId === topic.id ? '当前议题 · ' : '' }}{{ topic.source === 'user' ? '用户更正' : topic.source === 'ai' ? 'AI 判断，待核对' : '程序记录' }} · 本次 {{ topic.questionIds.length - topic.budgetStart }}/{{ MAX_TOPIC_QUESTIONS }} 题</small>
        <p>{{ topic.note }}</p>
        <details v-if="topic.observations.length"><summary>查看问答依据 · {{ topic.observations.length }} 次回答</summary><div v-for="item in topic.observations" :key="item.answerId" class="discussion-observation"><a :href="'#answer-' + item.answerId">查看对应回答 →</a><blockquote>「{{ item.quote }}」</blockquote><p>{{ item.summary }}</p></div></details>
        <div v-if="!readOnly" class="discussion-actions">
          <AppButton variant="ghost" :disabled="!canEdit" @click="edit(topic.id)">更正状态</AppButton>
          <AppButton variant="secondary" :disabled="!canEdit || (session.discussion.currentTopicId === topic.id && topic.status === 'discussing')" @click="emit('focus', {topicId: topic.id, expectedRevision: session.discussion.revision})">{{ topic.questionIds.length ? '重新讨论' : '讨论这个' }}</AppButton>
        </div>
        <form v-if="editing === topic.id && !readOnly" class="discussion-editor" @submit.prevent="save(topic.id)">
          <label>更正后的状态<select v-model="status" :disabled="!canEdit"><option value="paused">暂缓</option><option value="awaiting_evidence">待补证据</option><option value="clarified">已澄清（用户判断）</option><option value="pending">重新打开，待讨论</option></select></label>
          <label>更正原因<textarea v-model="note" :disabled="!canEdit" maxlength="500" rows="3" placeholder="例如：这部分暂时没有试验记录，先讨论其他内容。" /></label>
          <p v-if="error" class="field-error" role="alert">{{ error }}</p>
          <div class="discussion-actions"><AppButton type="submit" :disabled="!canEdit">保存更正</AppButton><AppButton variant="ghost" :disabled="disabled" @click="editing = null">收起</AppButton></div>
          <small>保存只更新训练进度，不修改项目资料，也不触发模型。切换议题生成问题会调用所选模型。</small>
        </form>
      </article>
    </div>
    </details>
  </section>
</template>
