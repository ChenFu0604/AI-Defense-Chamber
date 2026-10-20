<script setup lang="ts">
import { ref } from 'vue'
import { X, ArrowUpRight, Check, CircleDashed } from 'lucide-vue-next'
import AppButton from './ui/AppButton.vue'
import { useSystemStore } from '../stores/system'
const dialog = ref<HTMLDialogElement | null>(null)
const mode = ref<'stage' | 'guide'>('stage')
const system = useSystemStore()
function open(value: 'stage' | 'guide' = 'stage') {
  mode.value = value
  dialog.value?.showModal()
}
defineExpose({ open })
</script>
<template>
  <dialog
    ref="dialog"
    class="stage-dialog"
    aria-labelledby="dialog-title"
    @click="$event.target === dialog && dialog?.close()"
  >
    <div class="dialog-heading">
      <span class="eyebrow">BUILDING IN THE OPEN</span
      ><button class="icon-button" aria-label="关闭窗口" @click="dialog?.close()">
        <X :size="20" />
      </button>
    </div>
    <template v-if="mode === 'stage'">
      <h2 id="dialog-title">你的项目，正在就位。</h2>
      <p>
        当前已开放项目创建、本地保存、画像分析、四角色提问与多轮答辩。AI
        分析需要服务端模型配置；主动选择的演示始终标注为模拟。会话与消息可保存恢复，真实答辩结束后可生成评分报告与五维雷达图，历史报告保存在后端。评分属于
        AI 主观训练建议。
      </p>
      <div class="milestone">
        <Check :size="18" /><span>阶段 01 · 首页与基础服务</span><b>已完成</b>
      </div>
      <div class="milestone muted">
        <CircleDashed :size="18" /><span>阶段 02 · 项目创建与本地保存</span><b>已完成</b>
      </div>
      <div class="milestone muted">
        <Check :size="18" /><span>阶段 03 · 项目分析与统一 AI 服务</span><b>已完成</b>
      </div>
      <div class="milestone">
        <Check :size="18" /><span>阶段 04 · 四角色 AI 评委</span><b>已实现</b>
      </div>
      <div class="milestone">
        <Check :size="18" /><span>阶段 05 · 动态答辩与多轮追问</span><b>已实现</b>
      </div>
      <div class="milestone">
        <Check :size="18" /><span>阶段 06 · 评分报告与能力雷达图</span><b>已实现</b>
      </div>
      <div class="milestone">
        <Check :size="18" /><span>阶段 07 · 项目漏洞地图</span><b>已实现</b>
      </div>
      <div class="milestone">
        <Check :size="18" /><span>阶段 08 · 历史记录与二次训练</span><b>已实现</b>
      </div>
    </template>
    <template v-else>
      <h2 id="dialog-title">本地开发指南</h2>
      <p>在项目根目录安装依赖，即可分别或同时启动前后端。完整说明见仓库 README。</p>
      <div class="command-line"><span>安装依赖</span><code>npm ci</code></div>
      <div class="command-line"><span>同时启动</span><code>npm run dev</code></div>
      <div class="command-line"><span>单独启动前端</span><code>npm run dev:web</code></div>
      <div class="command-line"><span>单独启动后端</span><code>npm run dev:server</code></div>
    </template>
    <p v-if="system.error" class="connection-error" role="status">{{ system.error }}</p>
    <div class="dialog-footer">
      <span>模型状态请查看项目分析区</span
      ><AppButton variant="secondary" :disabled="system.checking" @click="system.checkHealth"
        >{{ system.checking ? '检查中…' : '检查服务连接' }}<ArrowUpRight :size="16"
      /></AppButton>
    </div>
  </dialog>
</template>
