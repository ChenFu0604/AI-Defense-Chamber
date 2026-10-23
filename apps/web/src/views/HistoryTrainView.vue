<script setup lang="ts">
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { type JudgeId } from '@defense/shared'
import { useHistoryStore } from '../stores/history'
import { useDefenseStore } from '../stores/defense'
import AppButton from '../components/ui/AppButton.vue'
import JudgeRolePicker from '../components/judges/JudgeRolePicker.vue'
import TrainingSummary from '../components/defense/TrainingSummary.vue'
const route = useRoute(),
  router = useRouter(),
  history = useHistoryStore(),
  defense = useDefenseStore()
const id = computed(() => String(route.params.id)),
  entry = computed(() => history.archive.entries.find((e) => e.session.id === id.value))
const judgeId = ref<JudgeId>('business'),
  confirmed = ref(false)
watch(
  id,
  () => {
    defense.prepare()
    confirmed.value = false
    history.load()
  },
  { immediate: true },
)
onBeforeUnmount(defense.leave)
async function start() {
  if (!confirmed.value || !entry.value?.report) return
  const record = await defense.retrain(id.value, judgeId.value)
  if (record) await router.push({ name: 'defense-session', params: { id: record.id } })
}
</script>
<template>
  <RouterLink :to="{ name: 'history-detail', params: { id } }" class="back-link"
    >← 返回原答辩报告</RouterLink
  >
  <div class="view-heading">

    <h1>围绕薄弱点二次训练</h1>
    <p>创建新的独立会话，保留原始问答和评分。完成后可为新会话生成报告并进行对比。</p>
  </div>
  <StatusNotice v-if="history.error || defense.error" tone="error" compact>
    {{ history.error || defense.error }}
  </StatusNotice>
  <StatusNotice v-if="defense.warning" tone="warning" compact>{{ defense.warning }}</StatusNotice>
  <section v-if="entry?.report && entry.session.status === 'ended'" class="history-card surface-panel">

    <h2>{{ entry.session.project.name }}</h2>
    <p>沿用这场答辩保存的项目和画像快照。若需修改项目资料，可回到项目页面另行创建训练。</p>
    <TrainingSummary :session="entry.session" />
    <p v-if="entry.session.preferences">新会话沿用以上训练方式、目标和题数上限；原会话的提示记录不会当作新回答。</p>
    <h3>原报告中的薄弱点</h3>
    <ul>
      <li v-for="item in entry.report.output.weaknesses" :key="item.title">
        {{ item.title }}：{{ item.detail }}
      </li>
    </ul>
    <h3>改进任务</h3>
    <ul>
      <li v-for="task in entry.report.output.improvements" :key="task.title">
        {{ task.action }} · 完成标准：{{ task.acceptanceCriteria }}
      </li>
    </ul>
    <JudgeRolePicker v-model="judgeId" :disabled="defense.busy" />
    <label class="defense-confirm"
      ><input
        v-model="confirmed"
        type="checkbox"
        :disabled="defense.busy"
      />确认沿用原项目资料与画像，并将新回答及训练重点发送到服务端配置的模型。</label
    ><AppButton :disabled="!confirmed || defense.busy" :busy="defense.busy" @click="start">{{
      defense.busy ? '正在创建新会话…' : '创建薄弱点训练会话'
    }}</AppButton>
    <p>后端从原始评分报告提取最多 5 项训练重点，创建时不调用模型；进入新会话后生成首问。</p>
  </section>
  <StatusNotice v-else-if="!history.error" tone="info" compact>
    本地缺少已结束真实会话的评分报告，请先同步或生成原报告。
  </StatusNotice>
</template>
