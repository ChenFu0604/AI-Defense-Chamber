<script setup lang="ts">
import { computed } from 'vue'
import { Activity, MessageSquare, CheckCircle2 } from 'lucide-vue-next'
import {
  MAX_DEFENSE_QUESTIONS,
  defenseStatusLabels,
  type DefenseStatus,
  type AnalysisMode,
} from '@defense/shared'
const props = defineProps<{
  mode: AnalysisMode
  status: DefenseStatus
  questions: number
  answers: number
  limit?: number
}>()
const limit = computed(() => props.limit ?? MAX_DEFENSE_QUESTIONS)
const count = computed(() => Math.max(0, Math.min(limit.value, props.questions)))
const percent = computed(() => (count.value / limit.value) * 100)
</script>
<template>
  <section class="session-overview" aria-label="本场答辩状态">
    <div class="session-overview-top">
      <span class="session-source-chip" :class="mode"
        ><Activity :size="14" />{{
          mode === 'demo' ? '模拟演示 · 未调用模型' : '真实模型会话'
        }}</span
      ><span class="session-state-chip" :class="status"
        ><i />{{ defenseStatusLabels[status] }}</span
      >
    </div>
    <div class="session-overview-bottom">
      <div class="session-round">
        <span class="session-round-label">本轮提问</span
        ><strong
          >{{ count.toString().padStart(2, '0')
          }}<small>/ {{ limit }}</small></strong
        >
      </div>
      <div class="session-track-copy">
        <div class="session-track-label">
          <span>问题数量上限</span
          ><span><MessageSquare :size="13" />已保存 {{ answers }} 次回答</span>
        </div>
        <div
          class="session-track"
          role="progressbar"
          aria-label="本次答辩问题数量"
          :aria-valuemin="0"
          :aria-valuemax="limit"
          :aria-valuenow="count"
          :aria-valuetext="`${count} 个问题，上限 ${limit} 个；不是评分或完成率`"
        >
          <span :style="{ width: percent + '%' }" />
        </div>
        <p>
          <CheckCircle2 :size="12" />{{
            status === 'ended'
              ? '本场已结束，记录已保存，可进入诊断报告。'
              : '按自己的节奏练习，可随时结束；此进度仅表示题数。'
          }}
        </p>
      </div>
    </div>
  </section>
</template>
