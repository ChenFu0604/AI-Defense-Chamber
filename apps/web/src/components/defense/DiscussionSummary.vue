<script setup lang="ts">
import { computed } from 'vue'
import { discussionSummary, type DefenseSession } from '@defense/shared'
const props = defineProps<{session: DefenseSession}>()
const summary = computed(() => discussionSummary(props.session))
</script>
<template>
  <section v-if="summary" class="discussion-summary" aria-label="本场讨论小结">
    <span class="section-kicker">YOUR SESSION RECAP</span><h2>本场讨论留下的下一步</h2>
    <p>根据已保存的议题和问答整理，不重新调用模型。状态只描述讨论进度，用户更正不等于已验证的结论。</p>
    <div class="discussion-grid"><article v-for="group in ([['clarified', '本场已澄清'], ['evidence', '还需补充证据'], ['unfinished', '暂缓或仍待澄清'], ['uncovered', '本场尚未覆盖']] as const)" :key="group[0]">
      <h3>{{ group[1] }} · {{ summary[group[0]].length }}</h3><ul><li v-for="topic in summary[group[0]]" :key="topic.id"><strong>{{ topic.title }}</strong><span>{{ topic.source === 'user' ? '（用户更正）' : '' }}</span><p>{{ topic.note }}</p></li></ul><p v-if="!summary[group[0]].length">本组没有记录，不代表能力评分或项目事实结论。</p>
    </article></div>
    <p v-if="summary.unassessedAnswers.length" class="notice">{{ summary.unassessedAnswers.length }} 次已保存回答尚未完成逐轮评价；记录保留，不补造反馈。</p>
  </section>
</template>
