<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, History, MessagesSquare } from 'lucide-vue-next'
import type { DefenseStatus } from '@defense/shared'
import type { recentDefenseSessions } from '../../services/defense-storage'

const props = defineProps<{ sessions: ReturnType<typeof recentDefenseSessions> }>()
const visible = computed(() => props.sessions.slice(0, 5))
const states: Record<DefenseStatus, string> = {
  ready: '待开始', generating: '正在生成', awaiting_answer: '待回答', failed: '需要重试', ended: '已结束',
}
const action = (status?: DefenseStatus) => status === 'ended' ? '查看记录' : status === 'failed' ? '打开重试' : status ? '继续训练' : '打开记录'
const displayTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value))
</script>

<template>
  <section v-if="visible.length" class="recent-training" aria-label="继续已有会话">
    <header class="recent-training-heading">
      <div><h3>继续已有会话 <span>{{ sessions.length }} 场</span></h3><p>选择一场继续，或回看已有记录。</p></div>
      <RouterLink to="/history" class="recent-history-link"><History :size="15" aria-hidden="true" />全部历史<ArrowRight :size="14" aria-hidden="true" /></RouterLink>
    </header>
    <div class="recent-training-list">
      <RouterLink v-for="session in visible" :key="session.id"
        :to="{ name: 'defense-session', params: { id: session.id } }" class="recent-training-card"
        :aria-label="`${session.name || '未命名项目'}，会话 ${session.id.slice(0, 8)}，${action(session.status)}`">
        <span class="recent-training-icon" aria-hidden="true"><MessagesSquare :size="20" /></span>
        <div class="recent-training-content">
          <div class="recent-training-labels"><span class="recent-mode-label" :class="session.mode">{{ session.mode === 'demo' ? '模拟演示' : '模型答辩' }}</span><span v-if="session.status" class="recent-state-label" :class="session.status">{{ states[session.status] }}</span></div>
          <strong>{{ session.name || '未命名项目' }}</strong>
          <div class="recent-training-meta"><time v-if="session.updatedAt || session.createdAt" :datetime="session.updatedAt || session.createdAt">{{ displayTime((session.updatedAt || session.createdAt)!) }}</time><span v-if="session.answerCount !== undefined">{{ session.answerCount }} 次回答</span><span>会话 {{ session.id.slice(0, 8) }}</span></div>
        </div>
        <span class="recent-training-action">{{ action(session.status) }}<ArrowRight :size="16" aria-hidden="true" /></span>
      </RouterLink>
    </div>
    <p class="recent-training-note">{{ sessions.length > visible.length ? `显示最近 ${visible.length} 场。` : '' }}进度为上次保存状态，打开后同步；旧记录的进度在打开后查看。</p>
  </section>
</template>

<style scoped>
.recent-training { margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--line); min-width: 0; }
.recent-training-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.recent-training-heading h3 { display: flex; align-items: center; gap: 9px; margin: 0; color: var(--text-primary); font-size: 16px; line-height: 1.5; }
.recent-training-heading h3 span { color: var(--text-secondary); font-size: 12px; font-weight: var(--weight-body); }
.recent-training-heading p, .recent-training-note { margin: 5px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.7; }
.recent-history-link { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; color: var(--accent); font-size: 12px; text-decoration: none; white-space: nowrap; border-radius: 8px; padding: 6px 8px; }
.recent-history-link:hover { background: var(--accent-soft); }
.recent-training-list { display: grid; gap: 10px; }
.recent-training-card { display: flex; align-items: center; gap: 14px; min-width: 0; padding: 15px 16px; border-radius: 12px; background: var(--surface-subtle); color: var(--text-primary); text-decoration: none; transition: background-color 160ms ease-out, box-shadow 160ms ease-out; }
.recent-training-card:hover { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-border); }
.recent-training-card:focus-visible, .recent-history-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.recent-training-icon { display: grid; place-items: center; flex-shrink: 0; width: 40px; height: 40px; border-radius: 12px; color: var(--accent); background: var(--surface-card); }
.recent-training-content { flex: 1; min-width: 0; }
.recent-training-labels { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-bottom: 5px; font-size: 11px; line-height: 1.5; }
.recent-mode-label { color: var(--accent); }
.recent-mode-label.demo { color: var(--text-secondary); }
.recent-state-label { padding: 1px 7px; border-radius: 6px; color: var(--text-secondary); background: var(--surface-card); }
.recent-state-label.awaiting_answer, .recent-state-label.ready { color: var(--accent); }
.recent-state-label.failed { color: var(--danger); background: var(--danger-soft); }
.recent-state-label.ended { color: var(--success); background: var(--success-soft); }
.recent-training-content strong { display: block; overflow-wrap: anywhere; color: var(--text-primary); font-size: 14px; font-weight: var(--weight-strong); line-height: 1.6; }
.recent-training-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 3px 12px; margin-top: 4px; color: var(--text-secondary); font-size: 11px; line-height: 1.7; }
.recent-training-action { display: inline-flex; align-items: center; flex-shrink: 0; gap: 7px; color: var(--accent); font-size: 12px; white-space: nowrap; }
.recent-training .recent-training-note { margin-top: 12px; font-size: 11px; }
@media (max-width: 560px) { .recent-training-card { gap: 10px; padding: 13px 12px; } .recent-training-icon { width: 34px; height: 34px; } .recent-training-action { font-size: 0; gap: 0; } .recent-training-meta { gap: 2px 8px; } }
@media (prefers-reduced-motion: reduce) { .recent-training-card { transition: none; } }
</style>
