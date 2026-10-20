<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  judgeDefinitions,
  projectInputSchema,
  questionTypeLabels,
  severityLabels,
  type Project,
  type AnalysisMode,
} from '@defense/shared'
import { useAnalysisStore } from '../../stores/analysis'
import { useJudgesStore } from '../../stores/judges'
import JudgeSeat from './JudgeSeat.vue'
import JudgeDetails from './JudgeDetails.vue'
import AppButton from '../ui/AppButton.vue'
const props = defineProps<{ project?: Project }>()
const analysisStore = useAnalysisStore()
const judges = useJudgesStore()
const mode = ref<AnalysisMode>('live')
const analysis = computed(() =>
  props.project ? analysisStore.stateFor(props.project.id)[mode.value] : null,
)
const selected = computed(() => judgeDefinitions.find((judge) => judge.id === judges.selectedId)!)
const selectedStatements = computed(() =>
  judges.statements.filter((item) => item.speech.judgeId === judges.selectedId),
)
watch(
  () => props.project,
  (project) => {
    if (project) analysisStore.restore(project)
  },
  { immediate: true, deep: true },
)
watch(
  () => [
    props.project && JSON.stringify(projectInputSchema.parse(props.project)),
    props.project?.id,
    analysis.value?.id,
    mode.value,
  ],
  (values) => judges.prepare(JSON.stringify(values)),
  { immediate: true },
)
onBeforeUnmount(() => judges.cancel())
function run(all = false) {
  if (props.project && analysis.value)
    void judges.run(props.project, analysis.value, mode.value, all)
}
</script>
<template>
  <section class="judge-workbench" aria-label="多角色评委工作台">
    <div class="section-heading">
      <div>
        <div class="section-kicker">FOUR PERSPECTIVES · ONE MODEL</div>
        <h2>四个立场，逐一审视。</h2>
      </div>
      <span class="preview-chip">角色提问工作台</span>
    </div>
    <p class="judge-disclaimer">
      此处用于单轮角色预览，同一模型使用四套独立提示词，按顺序调用。完整多轮答辩请使用上方“确认资料并开始答辩”入口。
    </p>
    <div class="judges-grid">
      <JudgeSeat
        v-for="judge in judgeDefinitions"
        :key="judge.id"
        :judge="judge"
        :status="judges.statuses[judge.id]"
        :selected="judges.selectedId === judge.id"
        :active="judges.activeId === judge.id"
        @select="judges.select(judge.id)"
      />
    </div>
    <JudgeDetails :judge="selected" />
    <div class="judge-controls">
      <div class="judge-mode">
        <label for="judge-source-mode">提问来源</label>
        <select id="judge-source-mode" v-model="mode" :disabled="judges.busy">
          <option value="live">真实模型</option>
          <option value="demo">模拟演示 · 不调用模型</option>
        </select>
      </div>
      <AppButton :disabled="!analysis || judges.busy" @click="run()">{{
        judges.busy ? '评委正在分析…' : `请${selected.name}提问`
      }}</AppButton>
      <AppButton variant="secondary" :disabled="!analysis || judges.busy" @click="run(true)"
        >依次生成四位问题</AppButton
      >
      <AppButton v-if="judges.busy" variant="ghost" @click="judges.cancel()">取消提问</AppButton>
      <AppButton v-else-if="judges.statements.length" variant="ghost" @click="judges.clear()"
        >清空本轮</AppButton
      >
    </div>
    <p v-if="!project" class="notice">选择一个项目后，即可根据画像生成角色问题。</p>
    <div v-else-if="!analysis" class="notice">
      <p>
        请先生成{{
          mode === 'live' ? '真实模型' : '模拟'
        }}项目画像。真实模式未配置模型时会显示配置错误，系统不会自动改用模拟数据。
      </p>
      <RouterLink
        :to="{ name: 'project-detail', params: { id: project.id }, hash: '#analysis' }"
        class="text-button"
        >前往项目分析 →</RouterLink
      >
    </div>
    <p v-else class="judge-source">
      {{
        mode === 'demo'
          ? '模拟数据 · 未调用模型 · 模板示例'
          : `真实调用模式 · 基于模型画像 ${analysis.model}`
      }}。本轮问题仅保留在当前工作台，刷新后清空；画像内容仍需人工核实。
    </p>
    <p v-if="judges.busy" role="status">
      {{ judgeDefinitions.find((j) => j.id === judges.pendingId)?.name }}正在结合项目画像生成问题…
    </p>
    <div v-if="judges.error" role="alert" class="notice notice-error">
      {{ judges.error }} <span>已有问题已保留，可再次点击提问重试。</span>
    </div>
    <div class="judge-statements" aria-live="polite" :aria-busy="judges.busy">
      <p v-if="!selectedStatements.length" class="judge-empty">
        {{ selected.name }}尚未提问。选择来源并生成问题，或查看其他评委。
      </p>
      <article v-for="statement in selectedStatements" :key="statement.id" class="judge-statement">
        <div class="judge-question-meta">
          <strong>{{ selected.name }}</strong
          ><span>{{ questionTypeLabels[statement.speech.questionType] }}</span
          ><span :class="'risk-' + statement.speech.riskLevel">{{
            severityLabels[statement.speech.riskLevel]
          }}</span
          ><span>{{
            statement.mode === 'demo' ? '模拟数据 · 未调用模型' : `模型：${statement.model}`
          }}</span>
        </div>
        <h3>{{ statement.speech.question }}</h3>
        <p>关注点：{{ statement.speech.focus }}</p>
        <p>{{ statement.speech.rationale }}</p>
      </article>
    </div>
    <AppButton
      v-if="judges.statuses[judges.selectedId] === 'questioning'"
      variant="secondary"
      @click="judges.complete(judges.selectedId)"
      >标记该评委提问已阅</AppButton
    >
  </section>
</template>
