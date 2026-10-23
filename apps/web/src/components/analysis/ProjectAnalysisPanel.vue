<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import {
  Sparkles,
  ArrowUpRight,
  RefreshCw,
  LoaderCircle,
  AlertCircle,
  FlaskConical,
  X,
} from 'lucide-vue-next'
import { projectInputSchema, type Project } from '@defense/shared'
import { useAnalysisStore } from '../../stores/analysis'
import AppButton from '../ui/AppButton.vue'
import AnalysisResults from './AnalysisResults.vue'
import RequestWait from '../ui/RequestWait.vue'
import StatusNotice from '../ui/StatusNotice.vue'

const props = defineProps<{ project: Project }>()
const analyses = useAnalysisStore()
const state = computed(() => analyses.stateFor(props.project.id))
const record = computed(() => state.value[state.value.activeMode])
const configError = computed(() =>
  ['AI_NOT_CONFIGURED', 'AI_CONFIG_INVALID', 'AI_AUTH_ERROR'].includes(state.value.errorCode),
)
watch(
  () => ({
    id: props.project.id,
    signature: JSON.stringify(projectInputSchema.parse(props.project)),
  }),
  (_current, previous) => {
    if (previous) analyses.cancel(previous.id)
    analyses.restore(props.project)
  },
  { immediate: true },
)
onBeforeUnmount(() => analyses.cancel(props.project.id))
</script>
<template>
  <section id="analysis" class="project-analysis-panel surface-panel" aria-labelledby="analysis-title">

    <div class="analysis-panel-header">
      <div>
        <h2 id="analysis-title"><Sparkles :size="21" />项目智能分析</h2>
        <p>从核心价值、技术可行性到风险与证据，整理你的答辩起点。</p>
      </div>
      <div class="analysis-actions">
        <AppButton :disabled="state.status === 'loading'" @click="analyses.run(project, 'live')"
          ><LoaderCircle
            v-if="state.status === 'loading' && state.activeMode === 'live'"
            :size="16"
            class="spinning" /><RefreshCw v-else-if="state.live" :size="16" />{{
            state.status === 'loading' && state.activeMode === 'live'
              ? '分析中…'
              : state.live
                ? '重新分析'
                : '分析项目'
          }}<ArrowUpRight v-if="!state.live && state.status !== 'loading'" :size="16" /></AppButton
        ><AppButton
          variant="secondary"
          :disabled="state.status === 'loading'"
          @click="analyses.run(project, 'demo')"
          ><FlaskConical :size="15" />{{ state.demo ? '刷新模拟示例' : '查看模拟示例' }}</AppButton
        >
      </div>
    </div>
    <p class="analysis-transmission-note">
      点击“分析项目”会将这份项目资料发送至服务端配置的模型服务；模拟示例不调用模型。
    </p>
    <div
      v-if="state.status === 'loading'"
      class="analysis-loading"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle :size="22" class="spinning" />
      <div>
        <strong>{{
          state.activeMode === 'demo' ? '正在准备模拟结构示例' : '正在分析项目，请稍候'
        }}</strong>
        <p>
          {{
            state.activeMode === 'demo'
              ? '这是预置模板演示，不调用 AI 模型。'
              : '正在请求模型并检查返回结果。已有画像保留，新结果通过校验后才会替换。'
          }}
        </p>
        <RequestWait embedded :active="state.status === 'loading' && state.activeMode === 'live'" :request-key="project.id" />
      </div>
      <button type="button" class="text-button control-button" @click="analyses.cancel(project.id)">

        <X :size="14" />取消分析
      </button>
    </div>
    <div v-if="state.status === 'error'" class="notice notice-error analysis-error" role="alert">
      <AlertCircle :size="18" />
      <div>
        <strong>{{ configError ? '需要配置模型服务' : '这次分析未完成' }}</strong>
        <p>{{ state.error }}</p>
        <p v-if="configError">在系统设置中保存模型配置后，再点击“分析项目”，无需重启服务。</p>
        <p v-if="['AI_TIMEOUT', 'CLIENT_TIMEOUT'].includes(state.errorCode)">
          可在模型配置中延长等待时间（最长 5 分钟）；若仍超时，请检查服务商状态或切换模型。
        </p>
        <p v-if="configError || ['AI_TIMEOUT', 'CLIENT_TIMEOUT'].includes(state.errorCode)">
          <RouterLink to="/settings" class="text-button">前往系统设置 → 模型配置</RouterLink>
        </p>
        <p>已有项目和先前画像保留；不会自动切换成模拟结果。</p>
        <AppButton variant="secondary" @click="analyses.run(project, state.activeMode)"
          >重试本次分析<RefreshCw :size="14"
        /></AppButton>
      </div>
    </div>
    <StatusNotice v-if="state.status === 'cancelled'" compact>
      本次分析已取消。已有资料和画像保留，可再次分析。
    </StatusNotice>
    <StatusNotice v-if="state.warning" tone="warning" compact>
      {{ state.warning }}
    </StatusNotice>
    <div v-if="state.live && state.demo" class="analysis-mode-tabs" aria-label="分析来源">
      <button class="control-button"
        type="button"
        :disabled="state.status === 'loading'"
        :aria-pressed="state.activeMode === 'live'"
        @click="analyses.showMode(project.id, 'live')"
      >

        真实模型分析</button
      ><button class="control-button"
        type="button"
        :disabled="state.status === 'loading'"
        :aria-pressed="state.activeMode === 'demo'"
        @click="analyses.showMode(project.id, 'demo')"
      >

        模拟示例
      </button>
    </div>
    <AnalysisResults v-if="record" :record="record" />
    <div v-else-if="state.status === 'idle'" class="analysis-initial">
      <Sparkles :size="26" :stroke-width="1.3" />
      <h3>从一份画像，看清下一步。</h3>
      <p>分析将整理八类信息，并明确标记材料依据、待验证推测与证据不足。</p>
      <span>尚未生成分析结果</span>
    </div>
  </section>
</template>
