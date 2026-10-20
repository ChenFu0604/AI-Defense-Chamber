<script setup lang="ts">
import { ref, watch } from 'vue'
import { FileText, Image as ImageIcon, ExternalLink, X } from 'lucide-vue-next'
import { attachmentUrl, type Attachment } from '@defense/shared'
const props = defineProps<{ items: Attachment[]; removable?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ remove: [id: string] }>()
const unavailable = ref<string[]>([])
watch(
  () => props.items,
  () => {
    unavailable.value = []
  },
)
</script>
<template>
  <div v-if="items.length" class="attachment-grid" aria-label="已添加附件">
    <article v-for="file in items" :key="file.id" class="attachment-card">
      <div class="attachment-preview">
        <img
          v-if="file.mimeType === 'image/jpeg' && !unavailable.includes(file.id)"
          :src="attachmentUrl(file.id)"
          :alt="file.name"
          loading="lazy"
          @error="unavailable.push(file.id)"
        />
        <div v-else class="attachment-file-icon">
          <ImageIcon v-if="file.mimeType === 'image/jpeg'" :size="28" /><FileText
            v-else
            :size="28"
          />
          <span>{{
            unavailable.includes(file.id)
              ? '图片暂时无法读取，请检查后端'
              : file.mimeType === 'application/pdf'
                ? `PDF · ${file.pageCount} 页`
                : 'TXT 文本'
          }}</span>
        </div>
        <button
          v-if="removable"
          type="button"
          class="attachment-remove"
          :aria-label="'移除附件 ' + file.name"
          :disabled="disabled"
          @click="emit('remove', file.id)"
        >
          <X :size="15" />
        </button>
      </div>
      <div class="attachment-caption">
        <strong :title="file.name">{{ file.name }}</strong
        ><span>{{ Math.ceil(file.size / 1024) }} KB · 已存后端</span>
        <a :href="attachmentUrl(file.id)" target="_blank" rel="noopener noreferrer"
          >查看文件<ExternalLink :size="12"
        /></a>
      </div>
      <details v-if="file.text" class="attachment-extraction">
        <summary>
          查看提取文字 · {{ file.text.length }} 字{{ file.truncated ? '（已截断）' : '' }}
        </summary>
        <pre>{{ file.text }}</pre>
      </details>
    </article>
  </div>
</template>
