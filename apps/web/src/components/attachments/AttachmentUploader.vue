<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Upload, LoaderCircle, FileText } from 'lucide-vue-next'
import { MAX_ATTACHMENTS, type Attachment } from '@defense/shared'
import { uploadAttachment } from '../../services/attachments-api'
import AttachmentGallery from './AttachmentGallery.vue'
import AppButton from '../ui/AppButton.vue'
const props = defineProps<{ modelValue: Attachment[]; disabled?: boolean; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [items: Attachment[]]; busy: [value: boolean] }>()
const input = ref<HTMLInputElement | null>(null),
  busy = ref(false),
  dragging = ref(false),
  error = ref(''),
  currentName = ref('')
let controller: AbortController | null = null,
  active = true
async function acceptFiles(files: File[]) {
  if (props.disabled || busy.value || !files.length) return
  error.value = ''
  if (props.modelValue.length + files.length > MAX_ATTACHMENTS) {
    error.value = `最多添加 ${MAX_ATTACHMENTS} 个附件，请先移除多余文件。`
    if (input.value) input.value.value = ''
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
        const saved = await uploadAttachment(file, controller.signal)
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
    controller = null
  }
}
function drop(event: DragEvent) {
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
    <div
      class="attachment-dropzone"
      :class="{ dragging, disabled: disabled || busy }"
      @dragover.prevent="!disabled && !busy && (dragging = true)"
      @dragleave.prevent="dragging = false"
      @drop.prevent="drop"
    >
      <Upload v-if="!busy" :size="24" /><LoaderCircle v-else :size="24" class="spinning" />
      <strong>{{ busy ? '正在上传并处理文件…' : '拖拽图片或文档到这里' }}</strong>
      <p v-if="busy" role="status">{{ currentName }}</p>
      <p v-else>图片 ≤ 4 MiB · PDF / TXT ≤ 8 MiB · PDF 最多 40 页</p>
      <input
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
      <FileText :size="14" />PDF 提取文字供模型参考，最多保留 12000 字；扫描版暂不支持
      OCR。图片使用需要所选模型支持视觉。上传只存本机后端，分析或提交回答时才发送模型。
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
