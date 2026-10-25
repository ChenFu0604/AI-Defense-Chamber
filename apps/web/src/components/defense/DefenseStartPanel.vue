<script setup lang="ts">
import { ref, toRef, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import { type Project } from '@defense/shared'
import { useDefenseStore } from '../../stores/defense'
import { recentDefenseSessions } from '../../services/defense-storage'
import AppButton from '../ui/AppButton.vue'
import { SlidersHorizontal } from 'lucide-vue-next'
import JudgeRolePicker from '../judges/JudgeRolePicker.vue'
import DefenseModePicker from './DefenseModePicker.vue'
import TrainingPreferencesPicker from './TrainingPreferencesPicker.vue'
import ModelSettingsDialog from '../settings/ModelSettingsDialog.vue'
import RecentDefenseSessions from './RecentDefenseSessions.vue'
import RequestWait from '../ui/RequestWait.vue'
import StatusNotice from '../ui/StatusNotice.vue'
import { useSystemStore } from '../../stores/system'
import { useTrainingPreparation } from '../../composables/useTrainingPreparation'
const props = defineProps<{ project: Project }>()
const defense = useDefenseStore(),
  router = useRouter()
const system = useSystemStore()
const { mode, judgeId, preferences, confirmed, state, analysis, busy, error, start: prepareAndStart } = useTrainingPreparation(toRef(props, 'project'))
const settingsOpen = ref(false), navigationError = ref('')
const settingsDialogId = useId() + '-model-settings'
const recent = ref<ReturnType<typeof recentDefenseSessions>>([])
const recentError = ref('')
watch(settingsOpen, (open, previous) => { if (!open && previous) void system.checkHealth() })
function refreshRecent() {
  recent.value = []
  recentError.value = ''
  try { recent.value = recentDefenseSessions().filter((value) => value.projectId === props.project.id) }
  catch { recentError.value = '无法读取浏览器会话入口；仍可用已保存的会话地址恢复。' }
}
watch(
  () => props.project,
  () => {
    settingsOpen.value = false
    refreshRecent()
  },
  { immediate: true, deep: true },
)
async function start() {
  if (mode.value === 'live' && system.checking) return
  navigationError.value = ''
  if (mode.value === 'live' && system.health?.ai !== 'configured' && system.health) {
    settingsOpen.value = true
    return
  }
  const session = await prepareAndStart()
  if (session) {
    refreshRecent()
    try { await router.push({ name: 'defense-session', params: { id: session.id } }) }
    catch { navigationError.value = '会话已创建，跳转失败；请通过下方会话入口恢复。' }
  }
}
</script>
<template>
  <section class="defense-start surface-panel">

    <h2>进入多轮答辩</h2>
    <ol class="preparation-steps" aria-label="训练准备步骤">
      <li :class="{ complete: confirmed }">01 · 确认项目资料</li>
      <li :class="{ complete: analysis }">02 · {{ state.status === 'loading' ? '正在分析项目…' : analysis ? '画像已准备' : '自动分析项目' }}</li>
      <li>03 · 开始评委对话</li>
    </ol>
    <p>
      会话保存当前项目与画像快照。每次追问会参考实际回答及有限历史；真实模式会将这些内容发送至服务端配置的模型。
    </p>
    <DefenseModePicker v-model="mode" :disabled="busy || settingsOpen" />
    <TrainingPreferencesPicker v-model="preferences" :disabled="busy || settingsOpen" />
    <JudgeRolePicker v-model="judgeId" :disabled="busy || settingsOpen" />
    <label class="defense-confirm"
      ><input
        v-model="confirmed"
        type="checkbox"
        :disabled="busy"
      />我已确认项目资料；真实模式下允许将资料发送给所配置模型，完成分析并开始答辩。</label
    >
    <StatusNotice v-if="state.warning || !analysis" compact :tone="state.warning ? 'warning' : 'info'" :announce="!!state.warning">{{ state.warning || '还没有与当前资料匹配的画像。点击下方按钮会先分析，成功后直接进入答辩，无需跳转。' }}</StatusNotice>
    <div v-if="mode === 'live'" class="inline-model-settings">
      <StatusNotice v-if="system.health && system.health.ai !== 'configured'" compact tone="warning">需要先连接模型。你可以在这里设置，项目选择会保留。</StatusNotice>
      <AppButton variant="secondary" :disabled="busy" aria-haspopup="dialog" :aria-expanded="settingsOpen" :aria-controls="settingsDialogId" @click="settingsOpen = true"><SlidersHorizontal :size="16" />配置或检查模型</AppButton>
    </div>
    <p v-if="mode === 'demo'" class="defense-source">
      模拟规则演示：引用回答展示交互流程，不代表真实模型理解或诊断。
    </p>
    <StatusNotice v-if="defense.error" tone="error" compact>{{ defense.error }}</StatusNotice>
    <StatusNotice v-if="error || navigationError" tone="error" compact>{{ error || navigationError }}</StatusNotice>
    <StatusNotice v-if="defense.warning || recentError" tone="warning" compact>{{ defense.warning || recentError }}</StatusNotice>
    <AppButton
      :disabled="!confirmed || busy || settingsOpen || (mode === 'live' && system.checking)"
      :busy="busy"
      @click="start"
      >{{ mode === 'live' && system.checking ? '正在检查模型状态…' : state.status === 'loading' ? '正在分析资料…' : busy ? '正在创建会话…' : analysis ? '开始答辩' : '分析资料并开始答辩' }}</AppButton
    >
    <RequestWait :active="busy && mode === 'live'" :request-key="project.id" label="正在准备本次训练" />
    <RecentDefenseSessions v-if="recent.length" :sessions="recent" />
    <ModelSettingsDialog :id="settingsDialogId" v-model="settingsOpen" />
  </section>
</template>
