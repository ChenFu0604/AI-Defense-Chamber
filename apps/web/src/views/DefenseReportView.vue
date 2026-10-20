<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { answerEvaluationLabels } from '@defense/shared'
import { useDefenseStore } from '../stores/defense'
import DefenseMessages from '../components/defense/DefenseMessages.vue'
const route = useRoute(),
  store = useDefenseStore()
const id = computed(() => String(route.params.id ?? ''))
watch(id, (value) => void store.load(value), { immediate: true })
onBeforeUnmount(() => store.leave())
const assessments = computed(() => store.session?.messages.filter((v) => v.assessment) ?? [])
const answers = computed(
  () => store.session?.messages.filter((v) => v.sender === 'user').length ?? 0,
)
</script>
<template>
  <RouterLink :to="{ name: 'defense-session', params: { id } }" class="back-link"
    >← 查看答辩会话</RouterLink
  >
  <div class="view-heading">
    <div class="eyebrow">REVIEW YOUR REASONING</div>
    <h1>答辩诊断报告</h1>
    <p>根据已保存的问答和逐轮分析整理，无额外生成的评分。</p>
  </div>
  <p v-if="store.error" role="alert" class="notice notice-error">
    {{ store.error }} <button @click="store.load(id)">重试读取</button>
  </p>
  <p v-if="store.busy" role="status">正在读取记录…</p>
  <template v-if="store.session?.status === 'ended'">
    <div class="defense-session-bar">
      <strong>{{ store.session.project.name }}</strong
      ><span>{{
        store.session.mode === 'demo' ? '模拟诊断 · 未调用模型' : '基于真实模型逐轮分析 · 待核实'
      }}</span
      ><span>已保存 {{ answers }} 次回答</span>
    </div>
    <p class="notice">
      此页汇总实际保存的逐轮评价。没有评价的回答不会被补造结论；模拟模式不代表真实诊断能力。
    </p>
    <div v-for="entry in assessments" :key="entry.id" class="defense-report-finding">
      <h3>{{ answerEvaluationLabels[entry.assessment!.evaluation] }}</h3>
      <p>回答依据：「{{ entry.assessment!.answerQuote }}」</p>
      <p>{{ entry.assessment!.feedback }}</p>
      <p v-for="risk in entry.assessment!.risks" :key="risk.title" class="defense-source">
        待验证风险（{{ risk.severity }}）：{{ risk.title }}
      </p>
    </div>
    <p v-if="!assessments.length" class="notice">尚无成功保存的回答分析，可以查看完整问答记录。</p>
    <h2>完整答辩记录</h2>
    <DefenseMessages :messages="store.session.messages" :demo="store.session.mode === 'demo'" />
  </template>
  <p v-else-if="store.session" class="notice">会话尚未结束，请返回会话结束答辩后查看报告。</p>
</template>
