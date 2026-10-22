<script setup lang="ts">
import { computed } from 'vue'
import { judgeDefinitions, type JudgeId } from '@defense/shared'
import JudgeAvatar from '../judges/JudgeAvatar.vue'
const props = defineProps<{
  judgeId: JudgeId
  hasMessages: boolean
  phase: 'generating' | 'processing' | 'reviewing'
  demo: boolean
}>()
const judge = computed(() => judgeDefinitions.find((item) => item.id === props.judgeId)!)
</script>
<template>
  <div class="defense-activity" role="status" aria-live="polite">
    <JudgeAvatar :id="judgeId" :size="20" />
    <div>
      <strong
        >{{
          phase === 'reviewing'
            ? '正在评价最后一答'
            : phase === 'processing'
            ? '正在保存并同步会话'
            : hasMessages
              ? `${judge.name}正在推敲下一问`
              : `${judge.name}正在准备首问`
        }}<span class="thinking-dots" aria-hidden="true"><i /><i /><i /></span
      ></strong>
      <p>
        {{
          phase === 'reviewing'
            ? '回答已保存，反馈完成后自动结束，不再生成新问题。'
            : phase === 'processing'
            ? '请稍候，操作完成后会更新当前记录。'
            : demo
              ? '正在准备模拟模板，不调用真实模型。'
              : hasMessages
                ? '结合项目资料与对话上下文，寻找值得继续追问的细节。'
                : '阅读项目背景与画像，从当前评委的视角切入。'
        }}
      </p>
    </div>
  </div>
</template>
