<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'
import {
  getDimensionAssessment,
  getReportCoverage,
  reportDimensionIds,
  reportDimensionLabels,
  type DefenseReport,
  type DefenseMessage,
} from '@defense/shared'
import ReportReferences from './ReportReferences.vue'
import { useImprovementsStore } from '../../stores/improvements'
import AppButton from '../ui/AppButton.vue'
import StatusNotice from '../ui/StatusNotice.vue'
import RagSources from '../knowledge/RagSources.vue'
const AbilityRadar = defineAsyncComponent(() => import('./AbilityRadar.vue'))
const props = defineProps<{ report: DefenseReport; messages: DefenseMessage[]; projectName?: string }>()
const coverage = computed(() => getReportCoverage(props.report))
const tasks = useImprovementsStore()
onMounted(tasks.load)
const priorities = { high: '优先处理', medium: '随后改进', low: '持续优化' }
</script>
<template>
  <div class="report-overview">
    <section class="report-card report-score surface-panel">

      <h2>综合评分</h2>
      <div v-if="report.overallScore !== null" class="report-score-number">{{ report.overallScore }}<span>/ 100</span></div>
      <p v-else class="report-score-unavailable">观察不足，暂不生成综合分</p>
      <p v-if="coverage.legacy" class="report-coverage-note">旧版报告 · 观察覆盖未标注。保留原评分，不重新计算。</p>
      <template v-else>
        <p class="report-coverage-note">已评估 {{ coverage.assessed }} / {{ coverage.total }} 个维度</p>
        <p v-if="report.overallScore === null">未充分评估的维度不记为 0 分；五个维度均完成评估后，才按等权平均计算综合分。</p>
        <p v-else>五个维度各占 20%，取算术平均，保留一位小数。</p>
      </template>
      <p>{{ report.output.summary }}</p>
      <small
        >基于 {{ report.answerCount }} 次回答 · {{ report.model }}<br />生成于
        {{ new Date(report.createdAt).toLocaleString('zh-CN') }}</small
      >
    </section>
    <section class="report-card surface-panel">

      <h2>五维能力画像</h2>
      <AbilityRadar :dimensions="report.output.dimensions" />
    </section>
  </div>
  <RagSources v-if="report.retrieval" :retrieval="report.retrieval" />
  <p class="notice">
    AI 的主观训练评价，不是绝对客观的能力测评，也不代表项目已通过外部验证。{{
      report.output.limitations
    }}
  </p>
  <section class="report-card surface-panel">

    <h2>下一次答辩前的行动清单</h2>
    <StatusNotice v-if="tasks.error" tone="error" compact>{{ tasks.error }}</StatusNotice>
    <RouterLink :to="{name: 'improvement-tasks', query: {project: report.projectId}}" class="text-button">查看项目改进任务 →</RouterLink>
    <ol class="report-tasks">
      <li v-for="(item, index) in report.output.improvements" :key="index">
        <h3>
          {{ item.title }}
          <span class="report-priority">{{ priorities[item.priority] }} · {{ reportDimensionLabels[item.dimension] }}</span>
        </h3>
        <p>{{ item.action }}</p>
        <p><strong>完成标准：</strong>{{ item.acceptanceCriteria }}</p>
        <ReportReferences :references="item.references" :messages="messages" />
        <div class="report-task-actions"><AppButton variant="secondary" :disabled="tasks.busy || tasks.loading || tasks.tasks.some(t => t.sourceReportId === report.id && t.improvementIndex === index)" @click="tasks.add(report, index, projectName ?? '项目')">{{ tasks.tasks.some(t => t.sourceReportId === report.id && t.improvementIndex === index) ? '已加入改进任务' : tasks.busy ? '正在保存…' : '加入改进任务' }}</AppButton></div>
      </li>
    </ol>
  </section>
  <section class="report-card surface-panel">

    <h2>分项评分与回答依据</h2>
    <div class="report-dimensions-grid">
    <div v-for="key in reportDimensionIds" :key="key" class="report-dimension" :class="{ 'is-insufficient': getDimensionAssessment(report.output.dimensions[key]) === 'insufficient' }">
      <h3>
        {{ reportDimensionLabels[key]
        }}<strong v-if="report.output.dimensions[key].score !== null">{{ report.output.dimensions[key].score }} <small>/ 100</small></strong>
        <span v-else class="report-assessment-state">未充分评估</span>
      </h3>
      <span v-if="getDimensionAssessment(report.output.dimensions[key]) === 'legacy'" class="report-assessment-legacy">旧版评分 · 观察状态未记录</span>
      <meter
        v-if="report.output.dimensions[key].score !== null"
        min="0"
        max="100"
        :value="report.output.dimensions[key].score!"
        :aria-label="reportDimensionLabels[key]"
      />
      <p>{{ report.output.dimensions[key].reason }}</p>
      <ReportReferences
        :references="report.output.dimensions[key].references"
        :messages="messages"
      />
    </div>
    </div>
  </section>
  <div class="report-sections">
    <section
      v-for="section in ['strengths', 'weaknesses', 'evidenceGaps', 'priorities'] as const"
      :key="section"
      class="report-card surface-panel"
      :class="'report-' + section"
    >

      <h2>
        {{
          {
            strengths: '回答中的优点',
            weaknesses: '需要加强的部分',
            evidenceGaps: '数据与证据缺口',
            priorities: '优先解决的问题',
          }[section]
        }}
      </h2>
      <article v-for="(item, index) in report.output[section]" :key="index" class="report-finding">
        <h3>
          {{ item.title }}
          <span v-if="'priority' in item" class="report-priority">{{
            priorities[item.priority]
          }}</span>
        </h3>
        <p>{{ item.detail }}</p>
        <p v-if="'neededEvidence' in item"><strong>建议补充：</strong>{{ item.neededEvidence }}</p>
        <ReportReferences :references="item.references" :messages="messages" />
      </article>
      <p v-if="!report.output[section].length" class="report-empty">
        本次记录未提供足够依据形成此类结论。
      </p>
    </section>
  </div>
</template>
<style scoped>
.report-score-unavailable { margin: 16px 0 12px; color: var(--text-primary); font-size: 22px; font-weight: var(--weight-strong); line-height: 1.5; }
.report-coverage-note { color: var(--text-secondary); font-size: 13px; }
.report-assessment-state { padding: 4px 8px; border-radius: 7px; background: var(--warning-soft); color: var(--warning); font-size: 12px; font-weight: var(--weight-medium); line-height: 1.6; }
.report-assessment-legacy { display: inline-block; color: var(--text-secondary); font-size: 12px; line-height: 1.7; }
.report-dimension.is-insufficient h3 { flex-wrap: wrap; gap: 8px; }
</style>
