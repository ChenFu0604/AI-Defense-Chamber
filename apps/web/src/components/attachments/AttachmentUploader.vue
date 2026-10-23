<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Upload, LoaderCircle, FileText } from 'lucide-vue-next'
import { MAX_ATTACHMENTS, MAX_OCR_PAGES, type Attachment } from '@defense/shared'
import { uploadAttachment } from '../../services/attachments-api'
import AttachmentGallery from './AttachmentGallery.vue'
import AppButton from '../ui/AppButton.vue'
const props = defineProps<{ modelValue: Attachment[]; disabled?: boolean; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [items: Attachment[]]; busy: [value: boolean] }>()
const input = ref<HTMLInputElement | null>(null),
  documentInput = ref<HTMLInputElement | null>(null),
  ocrEnabled = ref(false),
  busy = ref(false),
  dragging = ref(false),
  error = ref(''),
  currentName = ref('')
let controller: AbortController | null = null,
  active = true,
  dragDepth = 0
function dragEnter(event: DragEvent) {
  if (props.disabled || busy.value || !event.dataTransfer?.types.includes('Files')) return
  dragDepth += 1
  dragging.value = true
}
function dragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  dragging.value = dragDepth > 0
}
function chooseDocuments() {
  if (props.disabled || busy.value || props.modelValue.length >= MAX_ATTACHMENTS) return
  ocrEnabled.value = true
  documentInput.value?.click()
}
defineExpose({ chooseDocuments })
async function acceptFiles(files: File[]) {
  if (props.disabled || busy.value || !files.length) return
  error.value = ''
  if (props.modelValue.length + files.length > MAX_ATTACHMENTS) {
    error.value = `最多添加 ${MAX_ATTACHMENTS} 个附件，请先移除多余文件。`
    if (input.value) input.value.value = ''
    if (documentInput.value) documentInput.value.value = ''
    return
  }
  busy.value = true
  emit('busy', true)
  controller = new AbortController()
  let added = [...props.modelValue]
  const failures: string[] = []
  try {
    for (const file of files) {
      if (!active) break
      currentName.value = file.name
      try {
        const saved = await uploadAttachment(file, controller.signal, { ocr: ocrEnabled.value })
        if (!active) break
        added = [...added, saved]
        emit('update:modelValue', added)
      } catch (failure) {
        if (!active) break
        failures.push(
          file.name +
            '：' +
            (failure instanceof Error &&
            failure.name !== 'TimeoutError' &&
            failure.name !== 'TypeError'
              ? failure.message
              : '上传超时或连接失败，请重试。'),
        )
      }
    }
    error.value = failures.join('\n')
  } finally {
    busy.value = false
    currentName.value = ''
    emit('busy', false)
    if (input.value) input.value.value = ''
    if (documentInput.value) documentInput.value.value = ''
    controller = null
  }
}
function drop(event: DragEvent) {
  dragDepth = 0
  dragging.value = false
  if (event.dataTransfer?.files) void acceptFiles(Array.from(event.dataTransfer.files))
}
function remove(id: string) {
  if (!props.disabled && !busy.value)
    emit(
      'update:modelValue',
      props.modelValue.filter((item) => item.id !== id),
    )
}
onBeforeUnmount(() => {
  active = false
  controller?.abort()
})
</script>
<template>
  <section class="attachment-uploader" :aria-label="label ?? '项目与回答附件'">
    <div class="attachment-heading">
      <div>
        <h3>{{ label ?? '补充图片与文档' }}</h3>
        <p>产品截图、架构图或项目材料，让说明更具体。</p>
      </div>
      <span>{{ modelValue.length }} / {{ MAX_ATTACHMENTS }}</span>
    </div>
    <label class="attachment-ocr-control">
      <input class="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl text-sky-900 placeholder:text-sky-400/50 focus:outline-none focus:border-white/70 focus:bg-white/40 transition-all focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" v-model="ocrEnabled" type="checkbox" :disabled="disabled || busy" />
      <span
        ><strong>OCR 识别扫描件和图片文字</strong
        ><small
          >简体中文 + 英文 · 本机处理，不调用模型；扫描 PDF 每份最多识别
          {{ MAX_OCR_PAGES }} 页，请核对识别结果。</small
        ></span
      >
    </label>
    <div
      class="attachment-dropzone"
      :class="{ dragging, disabled: disabled || busy }"
      @dragenter.prevent="dragEnter"
      @dragover.prevent
      @dragleave.prevent="dragLeave"
      @drop.prevent="drop"
    >
      <Upload v-if="!busy" :size="24" /><LoaderCircle v-else :size="24" class="spinning" />
      <strong>{{
        busy ? (ocrEnabled ? '正在上传并识别文字…' : '正在上传并处理文件…') : '拖拽图片或文档到这里'
      }}</strong>
      <p v-if="busy" role="status">{{ currentName }}</p>
      <p v-else>图片 ≤ 4 MiB · PDF / TXT ≤ 8 MiB · PDF 最多 40 页</p>
      <input class="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl text-sky-900 placeholder:text-sky-400/50 focus:outline-none focus:border-white/70 focus:bg-white/40 transition-all focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
        ref="documentInput"
        type="file"
        multiple
        accept="application/pdf,text/plain,.pdf,.txt"
        hidden
        aria-label="选择项目文档（PDF 或 TXT）"
        :disabled="disabled || busy || modelValue.length >= MAX_ATTACHMENTS"
        @change="acceptFiles(Array.from(($event.target as HTMLInputElement).files ?? []))"
      />
      <input class="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl text-sky-900 placeholder:text-sky-400/50 focus:outline-none focus:border-white/70 focus:bg-white/40 transition-all focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
        ref="input"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.txt"
        hidden
        aria-label="选择图片或文档"
        :disabled="disabled || busy || modelValue.length >= MAX_ATTACHMENTS"
        @change="acceptFiles(Array.from(($event.target as HTMLInputElement).files ?? []))"
      />
      <AppButton
        variant="secondary"
        :busy="busy"
        :disabled="disabled || modelValue.length >= MAX_ATTACHMENTS"
        @click="input?.click()"
        ><Upload :size="15" />上传图片 / 文档</AppButton
      >
    </div>
    <p class="attachment-help">
      <FileText :size="14" />文字版 PDF 直接提取；扫描件或图片请开启 OCR，识别最长等待 90
      秒，每份最多保留 12000 字。上传只存本机后端，分析或提交回答时才发送模型。仅附图片时可关闭
      OCR；图片理解需要模型支持视觉。
    </p>
    <p v-if="error" class="notice notice-error attachment-error" role="alert">{{ error }}</p>
    <AttachmentGallery
      :items="modelValue"
      removable
      :disabled="disabled || busy"
      @remove="remove"
    />
  </section>
</template>
