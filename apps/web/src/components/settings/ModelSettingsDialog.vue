<script setup lang="ts">
import AppButton from '../ui/AppButton.vue'
import AppDialog from '../ui/AppDialog.vue'
import ModelConfigCard from './ModelConfigCard.vue'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>
<template>
  <AppDialog :model-value="modelValue" title="配置或检查模型"
    description="在这里获取模型、测试连接并保存，关闭后继续当前训练准备。"
    @update:model-value="emit('update:modelValue', $event)">
    <ModelConfigCard v-if="modelValue" embedded />
    <template #footer>
      <AppButton variant="secondary" @click="emit('update:modelValue', false)">返回训练准备</AppButton>
    </template>
  </AppDialog>
</template>
