<script setup lang="ts">
import AeroDecor from '../ui/AeroDecor.vue'
import { computed } from 'vue'
import {
  riskSourceLabels,
  severityLabels,
  projectFieldLabels,
  type RiskGraph,
  type RiskNode,
  type RiskEvidence,
} from '@defense/shared'
const props = defineProps<{ node: RiskNode; graph: RiskGraph }>()
defineEmits<{ close: []; select: [id: string] }>()
const relations = computed(() =>
  props.graph.edges
    .filter((edge) => edge.source === props.node.id || edge.target === props.node.id)
    .map((edge) => ({
      edge,
      other: props.graph.nodes.find(
        (node) => node.id === (edge.source === props.node.id ? edge.target : edge.source),
      )!,
    })),
)
const originLabels = {
  project_material: '项目资料',
  defense_answer: '答辩回答',
  ai_analysis: 'AI 项目画像',
  ai_report: 'AI 评分报告',
  ai_turn: 'AI 逐轮反馈',
}
function locationLabel(ref: RiskEvidence) {
  if (ref.origin === 'project_material' && ref.locator.startsWith('attachment.'))
    return '项目附件提取文字'
  if (ref.origin === 'defense_answer') return '已保存的回答原文'
  if (ref.origin === 'project_material')
    return projectFieldLabels[ref.locator as keyof typeof projectFieldLabels] ?? '项目原文'
  const [section, position] = ref.locator.replace('assessment.', '').split('.')
  const labels: Record<string, string> = {
    risks: '风险记录',
    evidenceGaps: '证据缺口',
    weaknesses: '薄弱点',
    priorities: '优先问题',
  }
  return `${labels[section!] ?? '分析记录'} · 第 ${Number(position) + 1} 项`
}
</script>
<template>
  <aside
    class="risk-details aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
    aria-labelledby="risk-detail-title"
    tabindex="0"
    @keydown.esc="$emit('close')"
  >
      <AeroDecor />
    <div class="risk-detail-header">
      <span :class="'risk-badge risk-level-' + node.level">{{ severityLabels[node.level] }}</span
      ><button class="aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" type="button" aria-label="关闭风险详情" @click="$emit('close')">
      <AeroDecor :orbs="false" />×</button>
    </div>
    <h2 id="risk-detail-title">{{ node.name }}</h2>
    <p class="risk-source-label">{{ riskSourceLabels[node.source] }}</p>
    <p class="risk-description">{{ node.description }}</p>
    <p class="risk-muted">{{ node.levelReason }}</p>
    <h3>来源与原文依据</h3>
    <blockquote v-for="(ref, index) in node.evidence" :key="index">
      <strong>{{ originLabels[ref.origin] }}</strong
      ><small>{{ locationLabel(ref) }}</small>
      <p>「{{ ref.quote }}」</p>
    </blockquote>
    <p v-if="node.source !== 'evidence_supported'" class="risk-muted">
      原文引用只说明信息来自哪里，不代表风险已经得到外部验证。
    </p>
    <p v-if="node.verification">
      人工核验：{{ node.verification.reviewedBy }} · {{ node.verification.note }}
    </p>
    <h3>相关证据缺口</h3>
    <ul v-if="node.evidenceGaps.length">
      <li v-for="gap in node.evidenceGaps" :key="gap">{{ gap }}</li>
    </ul>
    <p v-else class="risk-muted">来源未标注与此节点直接关联的证据缺口。</p>
    <h3>改进建议</h3>
    <ul v-if="node.suggestions.length">
      <li v-for="item in node.suggestions" :key="item">{{ item }}</li>
    </ul>
    <p v-else class="risk-muted">来源没有提供具体改进建议，未自动补造任务。</p>
    <h3>
      关联节点 <span>({{ relations.length }})</span>
    </h3>
    <div v-for="{ edge, other } in relations" :key="edge.id" class="risk-relation">
      <button class="aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" type="button" @click="$emit('select', other.id)">
      <AeroDecor :orbs="false" />{{ other.name }} →</button>
      <p>{{ edge.explanation }}</p>
    </div>
    <p v-if="!relations.length" class="risk-muted">
      暂无有明确共同依据的关联；未为了连线补造关系。
    </p>
  </aside>
</template>
