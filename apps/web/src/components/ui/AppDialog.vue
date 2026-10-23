<script setup lang="ts">
import { ref, toRef, useId } from 'vue'
import { X } from 'lucide-vue-next'
import { useNativeDialog } from '../../composables/useNativeDialog'
const props = defineProps<{ modelValue: boolean; title: string; description?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const dialog = ref<HTMLDialogElement | null>(null), labelId = useId()
const dismiss = () => emit('update:modelValue', false)
const { cancel, closed, backdrop } = useNativeDialog(dialog, toRef(props, 'modelValue'), dismiss)
</script>
<template>
  <dialog ref="dialog" class="app-dialog" :aria-labelledby="labelId + '-title'"
    :aria-describedby="description ? labelId + '-description' : undefined" @cancel="cancel" @close="closed" @click="backdrop">
    <header class="app-dialog-header">
      <div><h2 :id="labelId + '-title'">{{ title }}</h2><p v-if="description" :id="labelId + '-description'">{{ description }}</p></div>
      <button type="button" class="control-button app-dialog-close" :aria-label="'关闭' + title" autofocus @click="dismiss"><X :size="20" /></button>
    </header>
    <div class="app-dialog-body"><slot /></div>
    <footer v-if="$slots.footer" class="app-dialog-footer"><slot name="footer" /></footer>
  </dialog>
</template>
