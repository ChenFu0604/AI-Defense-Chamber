<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'
import StatusNotice from './ui/StatusNotice.vue'
import { prepareBrowserImport, importBrowserRecords, type BrowserImportPreview } from '../services/workspace-import'
const preview = ref<BrowserImportPreview | null>(null), open = ref(false), busy = ref(false), error = ref(''), message = ref('')
async function check() {
  error.value = ''
  try { preview.value = await prepareBrowserImport() }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '旧记录读取失败，原数据未覆盖。' }
}
async function migrate() {
  if (!preview.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    await importBrowserRecords(preview.value)
    message.value = '旧记录已导入服务端 SQLite。浏览器原数据仍保留，今后从服务端读取正式记录。'
    preview.value = null; open.value = false
  } catch (failure) { error.value = failure instanceof Error ? failure.message : '导入失败，原记录保留，可重试。' }
  finally { busy.value = false }
}
onMounted(check)
</script>
<template>
  <StatusNotice v-if="preview || error" :tone="error ? 'warning' : 'info'" compact title="旧浏览器记录迁移">
    {{ error || '正式项目和训练记录现在由本机后端 SQLite 保存。检测到旧浏览器数据，可核对后导入。' }}
    <template #actions><AppButton v-if="preview" variant="secondary" @click="open = true">检查并导入旧记录</AppButton><AppButton v-else variant="secondary" @click="check">重新检查</AppButton></template>
  </StatusNotice>
  <StatusNotice v-if="message" tone="success" compact>{{ message }}</StatusNotice>
  <AppDialog v-model="open" title="导入旧浏览器记录" description="仅发送至当前本机后端，不调用外部模型。不会删除浏览器原数据。">
    <StatusNotice v-if="error" tone="error" compact>{{ error }}</StatusNotice>
    <dl v-if="preview" class="migration-counts"><div v-for="(label, key) in {projects: '项目', analyses: '画像', sessions: '会话', reports: '报告', tasks: '改进任务'}" :key="key"><dt>{{ label }}</dt><dd>{{ preview.counts[key] }}</dd></div></dl>
    <p>同 ID、同内容的记录可重复导入；与服务端记录冲突时停止，保留两端原记录。附件原文件仍需存在于本机后端。</p>
    <p>未提交的项目与回答草稿继续保存在当前浏览器，不会作为正式训练记录导入。</p>
    <template #footer><AppButton variant="secondary" :disabled="busy" @click="open = false">暂不导入</AppButton><AppButton v-if="error" variant="secondary" :disabled="busy" @click="check">重新检查旧记录</AppButton><AppButton :busy="busy" :disabled="busy || !preview" @click="migrate">确认导入服务端</AppButton></template>
  </AppDialog>
</template>
<style scoped>
.migration-counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 12px; margin: 0 0 20px; }
.migration-counts > div { padding: 12px; border-radius: 10px; background: var(--surface-subtle); }
.migration-counts dt { color: var(--text-secondary); font-size: 12px; }
.migration-counts dd { margin: 5px 0 0; color: var(--text-primary); font-size: 20px; font-variant-numeric: tabular-nums; }
p { color: var(--text-secondary); font-size: 13px; line-height: 1.8; }
</style>
