<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import {
  reportDimensionIds,
  reportDimensionLabels,
  type DefenseReport,
  type DefenseMessage,
} from '@defense/shared'
import ReportReferences from './ReportReferences.vue'
const AbilityRadar = defineAsyncComponent(() => import('./AbilityRadar.vue'))
defineProps<{ report: DefenseReport; messages: DefenseMessage[] }>()
const priorities = { high: '优先处理', medium: '随后改进', low: '持续优化' }
</script>
<template>
  <div class="report-overview">
    <section class="report-card report-score">
      <div class="section-kicker">DEFENSE REVIEW · AI 训练建议</div>
      <h2>综合评分</h2>
      <div class="report-score-number">{{ report.overallScore }}<span>/ 100</span></div>
      <p>五个维度各占 20%，取算术平均，保留一位小数。</p>
      <p>{{ report.output.summary }}</p>
      <small
        >基于 {{ report.answerCount }} 次回答 · {{ report.model }}<br />生成于
        {{ new Date(report.createdAt).toLocaleString('zh-CN') }}</small
      >
    </section>
    <section class="report-card">
      <h2>五维能力画像</h2>
      <AbilityRadar :dimensions="report.output.dimensions" />
    </section>
  </div>
  <p class="notice">
    AI 的主观训练评价，不是绝对客观的能力测评，也不代表项目已通过外部验证。{{
      report.output.limitations
    }}
  </p>
  <section class="report-card">
    <h2>分项评分与回答依据</h2>
    <div v-for="key in reportDimensionIds" :key="key" class="report-dimension">
      <h3>
        {{ reportDimensionLabels[key]
        }}<strong>{{ report.output.dimensions[key].score }} <small>/ 100</small></strong>
      </h3>
      <meter
        min="0"
        max="100"
        :value="report.output.dimensions[key].score"
        :aria-label="reportDimensionLabels[key]"
      />
      <p>{{ report.output.dimensions[key].reason }}</p>
      <ReportReferences
        :references="report.output.dimensions[key].references"
        :messages="messages"
      />
    </div>
  </section>
  <div class="report-sections">
    <section
      v-for="section in ['strengths', 'weaknesses', 'evidenceGaps', 'priorities'] as const"
      :key="section"
      class="report-card"
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
  <section class="report-card">
    <h2>下一次答辩前的行动清单</h2>
    <ol class="report-tasks">
      <li v-for="(item, index) in report.output.improvements" :key="index">
        <h3>
          {{ item.title }}
          <span class="report-priority"
            >{{ priorities[item.priority] }} · {{ reportDimensionLabels[item.dimension] }}</span
          >
        </h3>
        <p>{{ item.action }}</p>
        <p><strong>完成标准：</strong>{{ item.acceptanceCriteria }}</p>
        <ReportReferences :references="item.references" :messages="messages" />
      </li>
    </ol>
  </section>
</template>
