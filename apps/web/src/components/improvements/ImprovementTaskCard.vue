<script setup lang="ts">
import { ref, useId } from 'vue'
import { improvementStatusLabels, reportDimensionLabels, type ImprovementTask, type ImprovementUpdate } from '@defense/shared'
import { useImprovementsStore } from '../../stores/improvements'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import StatusNotice from '../ui/StatusNotice.vue'
import AttachmentUploader from '../attachments/AttachmentUploader.vue'
import AttachmentGallery from '../attachments/AttachmentGallery.vue'

const props = defineProps<{task: ImprovementTask}>()
const store = useImprovementsStore(), dialogId = useId()
const open = ref(false), uploading = ref(false), saved = ref(false), error = ref('')
const base = ref<ImprovementTask | null>(null)
const draft = ref<ImprovementUpdate>({status: 'todo', note: '', attachments: []})
function edit() {
  if (!base.value || saved.value) {
    base.value = JSON.parse(JSON.stringify(props.task)) as ImprovementTask
    draft.value = {status: props.task.status, note: props.task.note,
      attachments: [...(props.task.attachments ?? [])]}
  }
  saved.value = false; error.value = ''; open.value = true
}
function save() {
  if (!base.value || uploading.value) return
  if (store.update(base.value, draft.value)) { saved.value = true; open.value = false; base.value = null }
  else error.value = store.error
}
</script>
<template>
  <article class="improvement-task surface-panel">
    <header><div><span class="improvement-task-meta">{{ task.projectName }} · {{ reportDimensionLabels[task.dimension] }}</span><h2>{{ task.title }}</h2></div><span class="improvement-status" :class="'is-' + task.status">{{ improvementStatusLabels[task.status] }}</span></header>
    <p>{{ task.action }}</p>
    <p class="improvement-criteria"><strong>完成标准：</strong>{{ task.acceptanceCriteria }}</p>
    <p v-if="task.note" class="improvement-note">{{ task.note }}</p>
    <AttachmentGallery v-if="task.attachments?.length" :items="task.attachments" />
    <div class="improvement-task-actions">
      <AppButton variant="secondary" @click="edit">记录进展与材料</AppButton>
      <RouterLink :to="{name: 'history-train', params: {id: task.sourceSessionId}, query: {task: task.id}}" class="app-button button-primary">针对这项复训</RouterLink>
      <RouterLink :to="{name: 'defense-report', params: {id: task.sourceSessionId}}" class="text-button">查看来源报告</RouterLink>
    </div>
    <p v-if="saved" class="positive-text" role="status">任务进展已保存。</p>
    <AppDialog :id="dialogId" v-model="open" :title="task.title" description="记录你实际做过的改进。保存后才能带入复训；关闭窗口保留本页输入，但不会自动保存。已完成表示自行记录，不代表已通过验证。">
      <StatusNotice v-if="error" tone="error" compact>{{ error }}</StatusNotice>
      <form class="improvement-editor" @submit.prevent="save">
        <label :for="dialogId + '-status'">进展状态</label>
        <select :id="dialogId + '-status'" v-model="draft.status"><option v-for="(label, key) in improvementStatusLabels" :key="key" :value="key">{{ label }}</option></select>
        <label :for="dialogId + '-note'">做了哪些改进、还有什么没解决？</label>
        <textarea :id="dialogId + '-note'" v-model="draft.note" rows="5" maxlength="2000" placeholder="例如：已完成3次访谈，整理了原始记录，但还没有验证付费意愿。" />
        <small>{{ draft.note.length }} / 2000</small>
        <AttachmentUploader :model-value="draft.attachments ?? []" label="为改进记录补充证据材料" @update:model-value="draft.attachments = $event" @busy="uploading = $event" />
      </form>
      <template #footer><AppButton :disabled="uploading" @click="save">{{ uploading ? '材料处理中…' : '保存进展' }}</AppButton></template>
    </AppDialog>
  </article>
</template>
