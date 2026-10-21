<script setup lang="ts">
import { ref, toRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { type Project } from '@defense/shared'
import { useDefenseStore } from '../../stores/defense'
import { recentDefenseSessions } from '../../services/defense-storage'
import AppButton from '../ui/AppButton.vue'
import { MessagesSquare, ArrowUpRight } from 'lucide-vue-next'
import JudgeRolePicker from '../judges/JudgeRolePicker.vue'
import DefenseModePicker from './DefenseModePicker.vue'
import ModelConfigCard from '../settings/ModelConfigCard.vue'
import { useSystemStore } from '../../stores/system'
import { useTrainingPreparation } from '../../composables/useTrainingPreparation'
const props = defineProps<{ project: Project }>()
const defense = useDefenseStore(),
  router = useRouter()
const system = useSystemStore()
const { mode, judgeId, confirmed, state, analysis, busy, error, start: prepareAndStart } = useTrainingPreparation(toRef(props, 'project'))
const settingsOpen = ref(false), navigationError = ref('')
const recent = ref<ReturnType<typeof recentDefenseSessions>>([])
const recentError = ref('')
async function toggleSettings() {
  if (settingsOpen.value) await system.checkHealth()
  settingsOpen.value = !settingsOpen.value
}
watch(
  () => props.project,
  (project) => {
    recent.value = []
    recentError.value = ''
    try {
      recent.value = recentDefenseSessions().filter((v) => v.projectId === project.id)
    } catch {
      recentError.value = '无法读取浏览器会话入口；仍可用已保存的会话地址恢复。'
    }
  },
  { immediate: true, deep: true },
)
async function start() {
  navigationError.value = ''
  if (mode.value === 'live' && system.health?.ai !== 'configured' && system.health) {
    settingsOpen.value = true
    return
  }
  const session = await prepareAndStart()
  if (session) {
    try { await router.push({ name: 'defense-session', params: { id: session.id } }) }
    catch { navigationError.value = '会话已创建，跳转失败；请通过下方会话入口恢复。' }
  }
}
</script>
<template>
  <section class="defense-start">
    <div class="section-kicker">ANSWER · CHALLENGE · REFINE</div>
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
    <JudgeRolePicker v-model="judgeId" :disabled="busy || settingsOpen" />
    <label class="defense-confirm"
      ><input
        v-model="confirmed"
        type="checkbox"
        :disabled="busy"
      />我已确认项目资料；真实模式下允许将资料发送给所配置模型，完成分析并开始答辩。</label
    >
    <p v-if="state.warning || !analysis" class="notice">{{ state.warning || '还没有与当前资料匹配的画像。点击下方按钮会先分析，成功后直接进入答辩，无需跳转。' }}</p>
    <div v-if="mode === 'live'" class="inline-model-settings">
      <p v-if="system.health && system.health.ai !== 'configured'" class="notice">需要先连接模型。你可以在这里设置，项目选择会保留。</p>
      <AppButton variant="secondary" :disabled="busy || system.checking" @click="toggleSettings">{{ settingsOpen ? '完成设置，返回训练准备' : '配置或检查模型' }}</AppButton>
      <ModelConfigCard v-if="settingsOpen" />
    </div>
    <p v-if="mode === 'demo'" class="defense-source">
      模拟规则演示：引用回答展示交互流程，不代表真实模型理解或诊断。
    </p>
    <p v-if="defense.error" role="alert" class="notice notice-error">{{ defense.error }}</p>
    <p v-if="error || navigationError" role="alert" class="notice notice-error">{{ error || navigationError }}</p>
    <p v-if="defense.warning || recentError" role="status">{{ defense.warning || recentError }}</p>
    <AppButton
      :disabled="!confirmed || busy || settingsOpen"
      :busy="busy"
      @click="start"
      >{{ state.status === 'loading' ? '正在分析资料…' : busy ? '正在创建会话…' : analysis ? '开始答辩' : '分析资料并开始答辩' }}</AppButton
    >
    <div v-if="recent.length" class="defense-recent">
      <h3>继续已有会话</h3>
      <RouterLink
        v-for="session in recent.slice(0, 5)"
        :key="session.id"
        :to="{ name: 'defense-session', params: { id: session.id } }"
        class="resume-session-card"
        ><MessagesSquare :size="20" />
        <div>
          <span class="resume-session-badge">{{
            session.mode === 'demo' ? '模拟演示' : '模型答辩'
          }}</span
          ><strong>答辩会话 · {{ session.id.slice(0, 8) }}</strong
          ><small>查看记录或继续回答</small>
        </div>
        <ArrowUpRight :size="17"
      /></RouterLink>
    </div>
  </section>
</template>
