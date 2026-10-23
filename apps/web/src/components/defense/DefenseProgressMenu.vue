<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue'
import { defenseStatusLabels, judgeDefinitions, type DefenseSession } from '@defense/shared'
const props = defineProps<{ session: DefenseSession; questions: number; limit: number; busy: boolean }>()
const id = useId(), trigger = ref<HTMLButtonElement | null>(null), panel = ref<HTMLElement | null>(null), open = ref(false)
const limit = computed(() => Math.max(1, props.limit))
const used = computed(() => Math.min(limit.value, Math.max(0, props.questions)))
const remaining = computed(() => limit.value - used.value)
const answers = computed(() => props.session.messages.filter(message => message.sender === 'user').length)
const judge = computed(() => judgeDefinitions.find(role => role.id === props.session.currentJudgeId)?.name)
function position() {
  if (!trigger.value || !panel.value) return
  const anchor = trigger.value.getBoundingClientRect(), box = panel.value.getBoundingClientRect()
  panel.value.style.left = Math.max(12, Math.min(anchor.right - box.width, window.innerWidth - box.width - 12)) + 'px'
  panel.value.style.top = Math.max(12, anchor.top - box.height - 10) + 'px'
}
function stop() { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
async function toggle(event: Event) {
  open.value = (event as ToggleEvent).newState === 'open'
  stop()
  if (!open.value) return
  await nextTick()
  if (!open.value) return
  position()
  window.addEventListener('resize', position)
  window.addEventListener('scroll', position, { capture: true, passive: true })
}
onBeforeUnmount(stop)
</script>
<template>
  <button ref="trigger" type="button" class="chat-progress-trigger" :popovertarget="id"
    :aria-expanded="open" :aria-controls="id" :aria-label="'查看本场训练进度，剩余 ' + remaining + ' 题'">
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle class="chat-progress-track" cx="12" cy="12" r="9" />
      <circle class="chat-progress-value" cx="12" cy="12" r="9" pathLength="100" :stroke-dasharray="(used / limit * 100) + ' 100'" />
    </svg>
    <span>{{ used }} / {{ limit }}</span>
  </button>
  <div :id="id" ref="panel" popover="auto" class="chat-progress-popover" aria-label="本场训练进度详情" @toggle="toggle">
    <header><h3>本场训练</h3><strong>剩余 {{ remaining }} 题</strong></header>
    <dl>
      <div><dt>本轮提问</dt><dd>{{ used }} / {{ limit }} 题</dd></div>
      <div><dt>已保存回答</dt><dd>{{ answers }} 次</dd></div>
      <div><dt>当前状态</dt><dd>{{ defenseStatusLabels[busy ? 'generating' : session.status] }}</dd></div>
      <div><dt>当前评委</dt><dd>{{ judge }}</dd></div>
      <div><dt>训练来源</dt><dd>{{ session.mode === 'demo' ? '模拟演示 · 未调用模型' : '真实模型会话' }}</dd></div>
    </dl>
    <p>题数包含切换评委产生的问题，仅表示本场提问数量，不是评分。可以按自己的节奏结束训练。</p>
  </div>
</template>
