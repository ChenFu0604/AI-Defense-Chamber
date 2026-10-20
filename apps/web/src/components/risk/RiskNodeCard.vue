<script setup lang="ts">
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { riskSourceLabels, severityLabels, type RiskNode } from '@defense/shared'
defineProps<NodeProps<RiskNode>>()
</script>
<template>
  <div class="risk-node-card" :class="['risk-level-' + data.level, { 'is-selected': selected }]">
    <Handle type="target" :position="Position.Left" :connectable="false" />
    <div class="risk-node-meta">
      <span>{{ severityLabels[data.level] }}</span
      ><span>{{ data.category === 'evidence_gap' ? '证据缺口' : '待处理问题' }}</span>
    </div>
    <strong>{{ data.name }}</strong>
    <p>{{ riskSourceLabels[data.source] }}</p>
    <small
      >{{
        data.evidence.filter((ref) => ['project_material', 'defense_answer'].includes(ref.origin))
          .length
      }}
      条原始依据 · 点击查看详情</small
    >
    <Handle type="source" :position="Position.Right" :connectable="false" />
  </div>
</template>
