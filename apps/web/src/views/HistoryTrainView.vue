<script setup lang="ts">
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { improvementStatusLabels } from '@defense/shared'
import { ArrowUpRight, FileText, RefreshCw, Target, CircleAlert, ListChecks } from 'lucide-vue-next'
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
  <div class="retraining-page">
  <RouterLink :to="{ name: 'history-detail', params: { id } }" class="back-link"
    >← 返回原答辩报告</RouterLink
  >
  <div class="view-heading retraining-page-heading">

    <h1>围绕薄弱点，再练一次</h1>
    <p>选择资料和需要复测的任务，创建独立的新会话。原问答和评分会继续保留。</p>
  </div>
  <StatusNotice v-if="history.error || defense.error || error" tone="error" compact>
    {{ history.error || error || defense.error }}
  </StatusNotice>
  <StatusNotice v-if="defense.warning" tone="warning" compact>{{ defense.warning }}</StatusNotice>
  <template v-if="entry?.report && entry.session.status === 'ended'">
    <section class="retraining-context surface-panel" aria-label="本次复训项目与原训练设置">
      <div class="retraining-project-heading"><span class="retraining-context-icon" aria-hidden="true"><Target :size="23" /></span><div><h2>{{ entry.session.project.name }}</h2><p>基于原报告复测改进情况，新会话完成后可生成独立报告并进行对比。</p></div></div>
      <p class="retraining-settings-label">原训练回顾 · 沿用训练方式、目标与题数</p>
      <TrainingSummary :session="entry.session" />
      <p v-if="entry.session.preferences" class="retraining-caption">新会话沿用以上训练方式、目标和题数上限；原会话的提示记录不会当作新回答。</p>
    </section>
    <div class="retraining-layout">
      <div class="retraining-main">
        <section class="retraining-section surface-panel" aria-labelledby="retraining-source-heading">
          <div class="retraining-section-heading"><span>01</span><div><h2 id="retraining-source-heading">选择本次项目资料</h2><p>沿用当时的资料，或检验修改后的版本。</p></div></div>
          <fieldset class="retraining-source-options" :disabled="busy || !!pending" aria-describedby="retraining-source-note"><legend class="sr-only">本次使用哪份项目资料？</legend>
            <label class="retraining-source-choice" :class="{'is-selected': sourceMode === 'original'}"><input v-model="sourceMode" name="retraining-source" type="radio" value="original" /><span><strong><FileText :size="16" aria-hidden="true" />原答辩资料与画像</strong><time :datetime="entry.session.project.updatedAt">{{ new Date(entry.session.project.updatedAt).toLocaleString('zh-CN') }}</time><small>保留原项目与画像快照，便于对照前后回答。</small></span></label>
            <label class="retraining-source-choice" :class="{'is-selected': sourceMode === 'current', 'is-unavailable': !currentProject}"><input v-model="sourceMode" name="retraining-source" type="radio" value="current" :disabled="!currentProject" /><span><strong><RefreshCw :size="16" aria-hidden="true" />当前浏览器保存的最新版本</strong><time v-if="currentProject" :datetime="currentProject.updatedAt">{{ new Date(currentProject.updatedAt).toLocaleString('zh-CN') }}</time><small>{{ currentProject ? '缺少匹配画像时先调用模型重新分析，再创建复训。' : '当前浏览器未找到原项目，可以沿用原资料训练。' }}</small></span></label>
          </fieldset>
          <p id="retraining-source-note" class="retraining-caption">原问答和评分保持原样，本次训练创建新的独立会话。</p>
        </section>
        <section class="retraining-section surface-panel" aria-labelledby="retraining-focus-heading">
          <div class="retraining-section-heading"><span>02</span><div><h2 id="retraining-focus-heading">确定重点复测的内容</h2><p>先回看薄弱点，再选择要带入本次训练的改进记录。</p></div></div>
          <h3 class="retraining-subheading"><CircleAlert :size="17" aria-hidden="true" />原报告中的薄弱点</h3>
          <ul v-if="entry.report.output.weaknesses.length" class="retraining-weaknesses">
            <li v-for="(item, index) in entry.report.output.weaknesses" :key="item.title"><span aria-hidden="true">{{ index + 1 }}</span><div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p></div></li>
          </ul>
          <p v-else class="retraining-caption">原报告未保存具体薄弱点，可参考下方改进建议。</p>
          <div class="retraining-task-heading"><h3 class="retraining-subheading"><ListChecks :size="17" aria-hidden="true" />本报告的改进任务</h3><span class="retraining-selected-count" aria-live="polite">已选 {{ selectedIds.length }} / 5</span></div>
          <p id="retraining-task-note" class="retraining-caption">选择要重点复测的任务，最多 5 项；进展和材料来自已保存的记录，不会自动认定已完成验证。</p>
          <div v-if="availableTasks.length" class="retraining-task-list" role="group" aria-label="选择重点复测任务" aria-describedby="retraining-task-note">
            <label v-for="task in availableTasks" :key="task.id" class="retraining-task-choice" :class="{'is-selected': selectedIds.includes(task.id)}"><input :id="'retrain-task-' + task.id" v-model="selectedIds" type="checkbox" :value="task.id" :disabled="busy || !!pending || (selectedIds.length >= 5 && !selectedIds.includes(task.id))" /><span class="retraining-task-content"><strong>{{ task.title }}</strong><span class="retraining-task-meta"><span :class="'is-' + task.status">{{ improvementStatusLabels[task.status] }}</span><span>{{ task.attachments?.length ?? 0 }} 份材料</span></span><span v-if="task.note" class="retraining-task-note">{{ task.note }}</span></span></label>
          </div>
          <div v-else class="retraining-task-empty"><ListChecks :size="20" aria-hidden="true" /><div><strong>还没有加入改进任务</strong><p>可以先按原报告的薄弱点训练，也可以从报告建议中加入任务。</p></div></div>
          <div class="retraining-task-footer"><p v-if="!selectedIds.length" class="retraining-caption">未选任务时，按原报告薄弱点与优先改进建议训练。</p><RouterLink :to="{name: 'improvement-tasks', query: {project: entry.session.project.id}}" class="text-button">记录或更新任务进展<ArrowUpRight :size="14" aria-hidden="true" /></RouterLink></div>
          <details v-if="!availableTasks.length" class="retraining-report-suggestions"><summary>查看原报告的改进建议</summary><ul><li v-for="task in entry.report.output.improvements" :key="task.title"><strong>{{ task.title }}</strong><p>{{ task.action }}</p><small>完成标准：{{ task.acceptanceCriteria }}</small></li></ul><RouterLink :to="{name: 'defense-report', params: {id}}" class="text-button">去报告中加入改进任务 →</RouterLink></details>
        </section>
      </div>
      <aside class="retraining-review surface-panel" aria-labelledby="retraining-start-heading">
        <div class="retraining-section-heading"><span>03</span><div><h2 id="retraining-start-heading">准备开始这一轮</h2><p>选择首位评委，确认后进入新会话。</p></div></div>
        <JudgeRolePicker v-model="judgeId" :disabled="busy || !!pending" />
        <StatusNotice v-if="pending" tone="warning" compact>上次创建结果尚待确认。安全重试将使用当时保存的资料、评委与任务快照，不会换成新的创建请求。<template #actions><RouterLink :to="{name: 'defense-session', params: {id: pending.input.requestId}}" class="text-button">读取上次会话 →</RouterLink></template></StatusNotice>
        <label class="defense-confirm"><input v-model="confirmed" type="checkbox" :disabled="busy" /><span>确认将所选项目资料、任务进展、补充材料与新回答用于服务端配置模型的本次训练。{{ pending ? '重试沿用上次已保存的请求快照。' : '' }}</span></label>
        <AppButton :disabled="!confirmed || busy" :busy="busy" @click="start(!!pending)">{{ working ? '正在准备画像与复训…' : pending ? '安全重试原创建' : '创建薄弱点训练会话' }}</AppButton>
        <p class="retraining-caption retraining-start-note">使用原资料或已生成的当前画像时，创建操作不调用模型；进入会话后由所选评委生成首问。每场报告独立保存。</p>
      </aside>
    </div>
  </template>
  <StatusNotice v-else-if="!history.error" tone="info" compact>
    本地缺少已结束真实会话的评分报告，请先同步或生成原报告。
  </StatusNotice>
  </div>
</template>
<style src="../styles/retraining.css"></style>
