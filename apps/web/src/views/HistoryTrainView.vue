<script setup lang="ts">
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { improvementStatusLabels } from '@defense/shared'
import { useHistoryStore } from '../stores/history'
import { useDefenseStore } from '../stores/defense'
import AppButton from '../components/ui/AppButton.vue'
import JudgeRolePicker from '../components/judges/JudgeRolePicker.vue'
import TrainingSummary from '../components/defense/TrainingSummary.vue'
import { useRetrainingPreparation } from '../composables/useRetrainingPreparation'
const route = useRoute(),
  router = useRouter(),
  history = useHistoryStore(),
  defense = useDefenseStore()
const id = computed(() => String(route.params.id)),
  entry = computed(() => history.archive.entries.find((e) => e.session.id === id.value))
watch(id, () => history.load(), {immediate: true, flush: 'sync'})
const requestedTask = computed(() => String(route.query.task ?? ''))
const {sourceMode, judgeId, confirmed, working, error, selectedIds, pending, currentProject, availableTasks, busy, start: prepare, retryPending} = useRetrainingPreparation(id, entry, requestedTask)
async function start(retry = false) {
  const record = await (retry ? retryPending() : prepare())
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
  <StatusNotice v-if="history.error || defense.error || error" tone="error" compact>
    {{ history.error || error || defense.error }}
  </StatusNotice>
  <StatusNotice v-if="defense.warning" tone="warning" compact>{{ defense.warning }}</StatusNotice>
  <section v-if="entry?.report && entry.session.status === 'ended'" class="history-card surface-panel">

    <h2>{{ entry.session.project.name }}</h2>
    <p>旧问答和报告保持原样。选择本场资料，再带着改进记录检查是否真正解决了问题。</p>
    <fieldset class="retraining-options" :disabled="busy || !!pending"><legend>本次使用哪份项目资料？</legend>
      <label><input v-model="sourceMode" type="radio" value="original" />原答辩资料与画像（{{ new Date(entry.session.project.updatedAt).toLocaleString('zh-CN') }}）</label>
      <label><input v-model="sourceMode" type="radio" value="current" :disabled="!currentProject" /><span>当前浏览器保存的最新版本<span v-if="currentProject">（{{ new Date(currentProject.updatedAt).toLocaleString('zh-CN') }}）</span><br /><small>缺少匹配画像时先调用模型重新分析，再创建复训。</small></span></label>
      <p v-if="!currentProject">当前浏览器未找到原项目，可以沿用原资料训练。</p>
    </fieldset>
    <TrainingSummary :session="entry.session" />
    <p v-if="entry.session.preferences">新会话沿用以上训练方式、目标和题数上限；原会话的提示记录不会当作新回答。</p>
    <h3>原报告中的薄弱点</h3>
    <ul>
      <li v-for="item in entry.report.output.weaknesses" :key="item.title">
        {{ item.title }}：{{ item.detail }}
      </li>
    </ul>
    <h3>本报告的改进任务</h3>
    <p>选择要重点复测的任务，最多 5 项；进展和材料来自已保存的记录，不会自动认定已完成验证。</p>
    <div v-for="task in availableTasks" :key="task.id" class="retraining-task-choice"><input :id="'retrain-task-' + task.id" v-model="selectedIds" type="checkbox" :value="task.id" :disabled="busy || !!pending || (selectedIds.length >= 5 && !selectedIds.includes(task.id))" /><label :for="'retrain-task-' + task.id"><strong>{{ task.title }}</strong><p>{{ improvementStatusLabels[task.status] }} · {{ task.attachments?.length ?? 0 }} 份材料</p><p v-if="task.note">{{ task.note }}</p></label></div>
    <RouterLink :to="{name: 'improvement-tasks', query: {project: entry.session.project.id}}" class="text-button">记录或更新任务进展 →</RouterLink>
    <p v-if="!selectedIds.length">未选任务时，按原报告薄弱点与优先改进建议训练。</p>
    <details v-if="!availableTasks.length"><summary>查看原报告的改进建议</summary><ul>
      <li v-for="task in entry.report.output.improvements" :key="task.title">
        {{ task.action }} · 完成标准：{{ task.acceptanceCriteria }}
      </li>
    </ul><RouterLink :to="{name: 'defense-report', params: {id}}" class="text-button">去报告中加入改进任务 →</RouterLink></details>
    <JudgeRolePicker v-model="judgeId" :disabled="busy || !!pending" />
    <StatusNotice v-if="pending" tone="warning" compact>上次创建结果尚待确认。安全重试将使用当时保存的资料、评委与任务快照，不会换成新的创建请求。<template #actions><RouterLink :to="{name: 'defense-session', params: {id: pending.input.requestId}}" class="text-button">读取上次会话 →</RouterLink></template></StatusNotice>
    <label class="defense-confirm"
      ><input
        v-model="confirmed"
        type="checkbox"
        :disabled="busy"
      />确认将所选项目资料、任务进展、补充材料与新回答用于服务端配置模型的本次训练。{{ pending ? '重试沿用上次已保存的请求快照。' : '' }}</label>
    <AppButton :disabled="!confirmed || busy" :busy="busy" @click="start(!!pending)">{{
      working ? '正在准备画像与复训…' : pending ? '安全重试原创建' : '创建薄弱点训练会话'
    }}</AppButton>
    <p>使用原资料或已生成的当前画像时，创建操作不调用模型；进入会话后由所选评委生成首问。每场报告独立保存。</p>
  </section>
  <StatusNotice v-else-if="!history.error" tone="info" compact>
    本地缺少已结束真实会话的评分报告，请先同步或生成原报告。
  </StatusNotice>
</template>
