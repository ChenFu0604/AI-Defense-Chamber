<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { judgeDefinitions, type AnalysisMode, type JudgeId, type Project } from '@defense/shared'
import { useAnalysisStore } from '../../stores/analysis'
import { useDefenseStore } from '../../stores/defense'
import { recentDefenseSessions } from '../../services/defense-storage'
import AppButton from '../ui/AppButton.vue'
const props = defineProps<{ project: Project }>()
const analysisStore = useAnalysisStore(),
  defense = useDefenseStore(),
  router = useRouter()
const mode = ref<AnalysisMode>('live'),
  judgeId = ref<JudgeId>('business'),
  confirmed = ref(false)
const analysis = computed(() => analysisStore.stateFor(props.project.id)[mode.value])
const recent = ref<ReturnType<typeof recentDefenseSessions>>([])
const recentError = ref('')
watch(
  () => props.project,
  (project) => {
    confirmed.value = false
    analysisStore.restore(project)
    try {
      recent.value = recentDefenseSessions().filter((v) => v.projectId === project.id)
    } catch {
      recentError.value = '无法读取浏览器会话入口；仍可用已保存的会话地址恢复。'
    }
  },
  { immediate: true, deep: true },
)
async function start() {
  if (!confirmed.value || !analysis.value) return
  const session = await defense.start({
    project: props.project,
    analysis: analysis.value,
    mode: mode.value,
    judgeId: judgeId.value,
  })
  if (session) await router.push({ name: 'defense-session', params: { id: session.id } })
}
</script>
<template>
  <section class="defense-start">
    <div class="section-kicker">ANSWER · CHALLENGE · REFINE</div>
    <h2>进入多轮答辩</h2>
    <p>
      会话保存当前项目与画像快照。每次追问会参考实际回答及有限历史；真实模式会将这些内容发送至服务端配置的模型。
    </p>
    <div class="defense-settings">
      <div>
        <label for="defense-mode">会话来源</label
        ><select id="defense-mode" v-model="mode" :disabled="defense.busy">
          <option value="live">真实模型</option>
          <option value="demo">模拟演示 · 未调用模型</option>
        </select>
      </div>
      <div>
        <label for="defense-first-judge">首位评委</label
        ><select id="defense-first-judge" v-model="judgeId" :disabled="defense.busy">
          <option v-for="judge in judgeDefinitions" :key="judge.id" :value="judge.id">
            {{ judge.name }}
          </option>
        </select>
      </div>
    </div>
    <label class="defense-confirm"
      ><input
        v-model="confirmed"
        type="checkbox"
        :disabled="defense.busy"
      />我已确认上述项目资料，将以此快照开始答辩。</label
    >
    <p v-if="!analysis" class="notice">
      请先生成{{ mode === 'live' ? '真实' : '模拟' }}项目画像。<RouterLink
        :to="{ name: 'project-detail', params: { id: project.id }, hash: '#analysis' }"
        >前往分析 →</RouterLink
      >
    </p>
    <p v-if="mode === 'demo'" class="defense-source">
      模拟规则演示：引用回答展示交互流程，不代表真实模型理解或诊断。
    </p>
    <p v-if="defense.error" role="alert" class="notice notice-error">{{ defense.error }}</p>
    <p v-if="defense.warning || recentError" role="status">{{ defense.warning || recentError }}</p>
    <AppButton :disabled="!confirmed || !analysis || defense.busy" @click="start">{{
      defense.busy ? '正在创建…' : '确认资料并开始答辩'
    }}</AppButton>
    <div v-if="recent.length" class="defense-recent">
      <h3>继续已有会话</h3>
      <RouterLink
        v-for="session in recent.slice(0, 5)"
        :key="session.id"
        :to="{ name: 'defense-session', params: { id: session.id } }"
        >{{ session.mode === 'demo' ? '模拟会话' : '真实会话' }} ·
        {{ session.id.slice(0, 8) }} →</RouterLink
      >
    </div>
  </section>
</template>
