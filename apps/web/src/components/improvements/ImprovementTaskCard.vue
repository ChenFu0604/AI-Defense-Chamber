<script setup lang="ts">
import { ref, useId } from 'vue'
import { improvementStatusLabels, reportDimensionLabels, type ImprovementTask, type ImprovementUpdate } from '@defense/shared'
import { ArrowUpRight, CheckCircle2, ChevronDown, ClipboardList, MessageSquare, Paperclip, PencilLine, RotateCcw } from 'lucide-vue-next'
import { useImprovementsStore } from '../../stores/improvements'
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import StatusNotice from '../ui/StatusNotice.vue'
import FormField from '../ui/FormField.vue'
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
async function save() {
  if (!base.value || uploading.value || store.busy) return
  if (await store.update(base.value, draft.value)) { saved.value = true; open.value = false; base.value = null }
  else error.value = store.error
}
</script>
<template>
  <article class="improvement-task surface-panel">
    <header class="improvement-task-heading">
      <span class="improvement-task-icon" aria-hidden="true"><ClipboardList :size="20" /></span>
      <div class="improvement-task-identity"><span class="improvement-task-meta">{{ task.projectName }} · {{ reportDimensionLabels[task.dimension] }}</span><h2>{{ task.title }}</h2></div>
      <span class="improvement-status" :class="'is-' + task.status">{{ improvementStatusLabels[task.status] }}</span>
    </header>
    <div class="improvement-task-content">
      <section class="improvement-action-copy" aria-label="下一步行动"><h3>下一步行动</h3><p>{{ task.action }}</p></section>
      <section class="improvement-criteria" aria-label="完成标准"><h3><CheckCircle2 :size="15" aria-hidden="true" />完成标准</h3><p>{{ task.acceptanceCriteria }}</p></section>
    </div>
    <section v-if="task.note" class="improvement-note" aria-label="最新进展"><h3><MessageSquare :size="15" aria-hidden="true" />最新进展</h3><p>{{ task.note }}</p></section>
    <AttachmentGallery v-if="task.attachments?.length" :items="task.attachments" />
    <div class="improvement-task-actions">
      <AppButton :disabled="store.busy" aria-haspopup="dialog" :aria-controls="dialogId" :aria-expanded="open" @click="edit"><PencilLine :size="15" />记录进展与材料</AppButton>
      <RouterLink :to="{name: 'history-train', params: {id: task.sourceSessionId}, query: {task: task.id}}" class="app-button button-secondary"><RotateCcw :size="15" aria-hidden="true" />针对这项复训</RouterLink>
      <RouterLink :to="{name: 'defense-report', params: {id: task.sourceSessionId}}" class="improvement-source-link">查看来源报告<ArrowUpRight :size="14" aria-hidden="true" /></RouterLink>
    </div>
    <p v-if="saved" class="positive-text" role="status">任务进展已保存。</p>
    <AppDialog :id="dialogId" v-model="open" class="improvement-progress-dialog" :title="task.title" description="记录实际进展，保存后带入复训。关闭窗口保留本页输入，不会自动保存。">
      <StatusNotice v-if="error" tone="error" compact>{{ error }}</StatusNotice>
      <form class="improvement-editor" @submit.prevent="save">
        <FormField :id="dialogId + '-status'" label="进展状态" :required="false" hint="已完成表示自行记录，不代表已通过验证。">
          <select :id="dialogId + '-status'" v-model="draft.status" :disabled="store.busy" :aria-describedby="dialogId + '-status-hint'"><option v-for="(label, key) in improvementStatusLabels" :key="key" :value="key">{{ label }}</option></select>
        </FormField>
        <FormField :id="dialogId + '-note'" label="做了哪些改进、还有什么没解决？" :required="false" hint="写下具体行动、得到的证据和仍待确认的问题。">
          <textarea :id="dialogId + '-note'" v-model="draft.note" :disabled="store.busy" rows="4" maxlength="2000" :aria-describedby="dialogId + '-note-hint ' + dialogId + '-note-count'" placeholder="例如：已完成3次访谈，整理了原始记录，但还没有验证付费意愿。" />
          <small :id="dialogId + '-note-count'" class="improvement-note-count">{{ draft.note.length }} / 2000</small>
        </FormField>
        <details class="improvement-editor-materials" :open="!!draft.attachments?.length">
          <summary><span><Paperclip :size="16" aria-hidden="true" />补充证据材料</span><span class="improvement-material-count">{{ draft.attachments?.length ?? 0 }} 份<ChevronDown :size="15" aria-hidden="true" /></span></summary>
          <AttachmentUploader :model-value="draft.attachments ?? []" :disabled="store.busy" label="为改进记录补充证据材料" @update:model-value="draft.attachments = $event" @busy="uploading = $event" />
        </details>
      </form>
      <template #footer><AppButton variant="secondary" :disabled="store.busy" @click="open = false">返回任务</AppButton><AppButton :disabled="uploading || store.busy" :busy="store.busy" @click="save">{{ uploading ? '材料处理中…' : '保存进展' }}</AppButton></template>
    </AppDialog>
  </article>
</template>
