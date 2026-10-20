<script setup lang="ts">
import { AlertTriangle, SearchCheck, MessageSquareText } from 'lucide-vue-next'
import { severityLabels, judgeLabels, type AnalysisRecord } from '@defense/shared'
import { formatProjectDate } from '../../utils/project-format'
import AnalysisFindingCard from './AnalysisFindingCard.vue'
defineProps<{ record: AnalysisRecord }>()
</script>
<template>
  <div class="analysis-results">
    <div class="analysis-provenance" :class="record.mode">
      <span class="source-badge">{{
        record.mode === 'demo' ? '模拟数据 · 未调用模型' : 'AI 模型分析 · 未外部核验'
      }}</span
      ><span
        >{{ record.model ?? '预置结构演示' }} ·
        <time :datetime="record.createdAt">{{ formatProjectDate(record.createdAt) }}</time></span
      >
    </div>
    <p class="analysis-disclaimer">
      {{
        record.mode === 'demo'
          ? '以下内容来自预置模板，仅演示画像结构，不代表模型理解、项目诊断或事实结论。'
          : '本画像基于用户提供的材料。引用仅表示材料中出现过，不代表真实性已验证；风险与可行性属于 AI 辅助判断，请人工核对。'
      }}
    </p>
    <div class="analysis-overview-grid">
      <AnalysisFindingCard
        title="01 · 项目核心价值"
        :finding="record.output.coreValue"
      /><AnalysisFindingCard
        title="02 · 技术可行性"
        :finding="record.output.technicalFeasibility"
      /><AnalysisFindingCard
        title="03 · 商业模式或应用价值"
        :finding="record.output.businessValue"
      />
    </div>
    <section class="analysis-group">
      <h3>目标用户与使用场景</h3>
      <div class="analysis-list">
        <AnalysisFindingCard
          v-for="(finding, index) in record.output.targetUsersAndScenarios"
          :key="index"
          :finding="finding"
        />
      </div>
    </section>
    <section class="analysis-group">
      <h3>项目主要优势</h3>
      <div v-if="record.output.strengths.length" class="analysis-list">
        <AnalysisFindingCard
          v-for="(finding, index) in record.output.strengths"
          :key="index"
          :finding="finding"
        />
      </div>
      <p v-else class="analysis-empty-note">
        当前分析未提出有充分依据的优势，不据此认定项目缺少价值。
      </p>
    </section>
    <section class="analysis-group risks-group">
      <div class="analysis-group-heading">
        <h3><AlertTriangle :size="17" />潜在风险</h3>
        <span>建议关注顺序，非客观测量</span>
      </div>
      <div v-if="record.output.risks.length" class="risk-list">
        <article
          v-for="(risk, index) in record.output.risks"
          :key="index"
          class="analysis-risk"
          :class="risk.severity"
        >
          <div class="risk-title">
            <h4>{{ risk.title }}</h4>
            <span class="risk-severity">{{ severityLabels[risk.severity] }}</span>
          </div>
          <AnalysisFindingCard :finding="risk" />
          <p class="risk-suggestion"><strong>建议行动</strong>{{ risk.suggestion }}</p>
        </article>
      </div>
      <p v-else class="analysis-empty-note">本次分析未列出具体风险，不等于项目已被证明没有风险。</p>
    </section>
    <section class="analysis-group evidence-gap-group">
      <h3><SearchCheck :size="17" />需要补充或核对的证据</h3>
      <div v-if="record.output.evidenceGaps.length" class="evidence-gap-list">
        <article v-for="(gap, index) in record.output.evidenceGaps" :key="index">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <h4>{{ gap.topic }}</h4>
            <p>{{ gap.missingEvidence }}</p>
            <p class="gap-action">{{ gap.suggestedAction }}</p>
          </div>
        </article>
      </div>
      <p v-else class="analysis-empty-note">
        本次分析未列出具体缺口，仍需结合项目实际材料人工核对。
      </p>
    </section>
    <section class="analysis-group">
      <h3><MessageSquareText :size="17" />推荐答辩问题方向</h3>
      <div class="question-direction-grid">
        <article v-for="(direction, index) in record.output.questionDirections" :key="index">
          <span class="judge-direction-tag">{{ judgeLabels[direction.judge] }}</span>
          <h4>{{ direction.topic }}</h4>
          <p>{{ direction.question }}</p>
          <small>{{ direction.reason }}</small>
        </article>
      </div>
    </section>
  </div>
</template>
