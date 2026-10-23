<script setup lang="ts">
import { assistanceKindLabels, type AssistanceKind, type AssistanceRecord } from '@defense/shared'
import AppButton from '../ui/AppButton.vue'
import StatusNotice from '../ui/StatusNotice.vue'
defineProps<{ records: AssistanceRecord[]; disabled: boolean; loading: boolean; failed: boolean; demo: boolean }>()
const emit = defineEmits<{ help: [kind: AssistanceKind]; retry: []; cancel: [] }>()
</script>
<template>
  <section class="assistance-panel" aria-label="回答求助">
    <h3>卡住也没关系，从这里继续。</h3>
    <p>提示不会替你提交回答，也不占题数。每题每种提示只生成一次，可以反复查看。</p>
    <div class="assistance-actions"><AppButton v-for="(label, kind) in assistanceKindLabels" :key="kind" variant="secondary" :disabled="disabled || records.some(v => v.kind === kind)" @click="emit('help', kind)">{{ label }}</AppButton></div>
    <StatusNotice v-if="loading" compact busy>{{ demo ? '正在准备模拟提示…' : '评委正在把问题拆小一点…' }}</StatusNotice>
    <StatusNotice v-if="failed" tone="error" compact title="提示未完成">
      你的回答草稿保留，可以重试或继续自己回答。
      <template #actions><AppButton variant="secondary" @click="emit('retry')">重试提示</AppButton><AppButton variant="ghost" @click="emit('cancel')">继续自己回答</AppButton></template>
    </StatusNotice>
    <article v-for="record in records" :key="record.requestId" class="assistance-record"><strong>{{ assistanceKindLabels[record.kind] }} · {{ record.mode === 'demo' ? '模拟提示' : 'AI 辅助' }}</strong><p>{{ record.content }}</p><small>这是系统辅助，不是你已提交的回答或已验证的项目事实。</small></article>
  </section>
</template>
