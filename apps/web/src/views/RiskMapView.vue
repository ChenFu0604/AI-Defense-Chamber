<script setup lang="ts">
import AeroDecor from '../components/ui/AeroDecor.vue'
import StatusNotice from '../components/ui/StatusNotice.vue'
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { severityLabels, riskSourceLabels } from '@defense/shared'
import { useRiskMap } from '../composables/useRiskMap'
import type { RiskMapSource } from '../services/risk-map-source'
import AppButton from '../components/ui/AppButton.vue'
import RiskNodeDetails from '../components/risk/RiskNodeDetails.vue'
const RiskCanvas = defineAsyncComponent(() => import('../components/risk/RiskCanvas.vue'))
const route = useRoute(),
  state = useRiskMap()
const {
  graph,
  title,
  notice,
  error,
  status,
  selected,
  selectedId,
  levelFilter,
  visibleNodes,
  visibleEdges,
} = state
const selectedEdgeId = ref<string | null>(null)
const source = computed<RiskMapSource>(() =>
  route.name === 'project-risks'
    ? {
        kind: 'project',
        id: String(route.params.id),
        mode: route.query.mode === 'demo' ? 'demo' : 'live',
      }
    : { kind: 'session', id: String(route.params.id) },
)
const back = computed(() =>
  source.value.kind === 'project'
    ? { name: 'project-detail', params: { id: source.value.id } }
    : { name: 'defense-report', params: { id: source.value.id } },
)
const filteredGraph = computed(() =>
  graph.value ? { ...graph.value, nodes: visibleNodes.value, edges: visibleEdges.value } : null,
)
const selectedEdge = computed(() =>
  graph.value?.edges.find((edge) => edge.id === selectedEdgeId.value),
)
async function reload() {
  selectedEdgeId.value = null
  await state.load(source.value)
}
watch(source, () => void reload(), { immediate: true })
watch(levelFilter, () => {
  if (!visibleNodes.value.some((node) => node.id === selectedId.value)) state.select(null)
  selectedEdgeId.value = null
})
onBeforeUnmount(state.leave)
function choose(id: string | null) {
  selectedEdgeId.value = null
  if (id && !visibleNodes.value.some((node) => node.id === id)) levelFilter.value = 'all'
  state.select(id)
}
function chooseEdge(id: string) {
  const edge = graph.value?.edges.find((item) => item.id === id)
  if (!edge) return
  state.select(edge.source)
  selectedEdgeId.value = id
}
</script>
<template>
  <RouterLink :to="back" class="back-link focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
    >← {{ source.kind === 'project' ? '返回项目详情' : '返回答辩报告' }}</RouterLink
  >
  <div class="view-heading risk-map-heading">
    <div>

      <h1>项目漏洞地图</h1>
      <p>{{ title || '从资料与回答中，找到需要补强的环节。' }}</p>
    </div>
    <AppButton variant="secondary" :disabled="status === 'loading'" @click="reload">{{
      status === 'loading' ? '读取中…' : '重新读取数据'
    }}</AppButton>
  </div>
  <p class="notice risk-map-note">
    连线表示共同的资料或回答依据，属于关联视图，不表示已证明的因果链。AI
    推测与用户陈述均不会自动升级为已验证事实。
  </p>
  <StatusNotice v-if="status === 'loading'" busy compact>正在读取项目画像与答辩风险…</StatusNotice>
  <StatusNotice v-if="status === 'error'" tone="error" title="漏洞地图读取未完成">
    {{ error }}
    <template #actions><AppButton variant="secondary" @click="reload">重试读取漏洞地图</AppButton></template>
  </StatusNotice>
  <template v-if="graph">
    <StatusNotice v-if="graph.mode === 'demo'" tone="info" compact>
      模拟数据 · 来自主动选择的模拟画像或模拟会话，不代表真实项目风险。
    </StatusNotice>
    <p class="risk-map-source-note">{{ notice }}</p>
    <div v-if="status === 'empty'" class="empty-state risk-empty aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
      <h2>暂无风险数据</h2>
      <p>当前来源没有可用风险记录。空地图不代表项目没有风险；不会为了丰富画布增加节点。</p>
      <RouterLink :to="back" class="app-button button-secondary aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500">
      <AeroDecor :orbs="false" />{{
        source.kind === 'project' ? '返回项目分析' : '查看答辩与报告'
      }}</RouterLink>
    </div>
    <template v-else-if="status === 'success'">
      <div class="risk-toolbar">
        <div class="risk-legend">
          <span class="risk-badge risk-level-high"
            >高风险 {{ graph.nodes.filter((node) => node.level === 'high').length }}</span
          ><span class="risk-badge risk-level-medium"
            >中风险 {{ graph.nodes.filter((node) => node.level === 'medium').length }}</span
          ><span class="risk-badge risk-level-low"
            >低风险 {{ graph.nodes.filter((node) => node.level === 'low').length }}</span
          >
        </div>
        <label
          >风险筛选
          <select class="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl text-sky-900 placeholder:text-sky-400/50 focus:outline-none focus:border-white/70 focus:bg-white/40 transition-all focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" v-model="levelFilter" aria-label="风险等级筛选">
            <option value="all">全部等级</option>
            <option value="high">仅高风险</option>
            <option value="medium">仅中风险</option>
            <option value="low">仅低风险</option>
          </select></label
        ><span>{{ visibleNodes.length }} 个节点 · {{ visibleEdges.length }} 条关联</span>
      </div>
      <p v-if="!graph.edges.length" class="risk-muted">
        当前记录没有可直接关联的原始依据；节点保留独立展示。
      </p>
      <StatusNotice v-if="selectedEdge" tone="info" compact>
        关联说明：{{ selectedEdge.explanation }}
      </StatusNotice>
      <div class="risk-workspace" :class="{ 'has-selection': selected }">
        <RiskCanvas
          v-if="filteredGraph && visibleNodes.length"
          :key="source.kind + source.id + graph.analysisId + graph.reportId + levelFilter"
          :graph="filteredGraph"
          :selected-id="selectedId"
          @select="choose"
          @edge="chooseEdge"
        />
        <div v-else class="empty-state risk-empty aero-panel group bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-xl transition-all duration-300 ease-out">
      <AeroDecor />
          <h2>该等级下暂无风险</h2>
          <button type="button" class="text-button aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500" @click="levelFilter = 'all'">
      <AeroDecor :orbs="false" />
            显示全部节点
          </button>
        </div>
        <RiskNodeDetails
          v-if="selected"
          :node="selected"
          :graph="graph"
          @close="choose(null)"
          @select="choose"
        />
      </div>
      <section class="risk-node-list" aria-labelledby="risk-list-title">
        <h2 id="risk-list-title">全部可见节点 <small>也可用键盘选择下列条目查看详情</small></h2>
        <button class="aero-control group bg-gradient-to-b from-white/90 to-white/60 backdrop-blur-md border border-white/50 rounded-full text-sky-700 shadow-lg transition-all duration-200 ease-out active:scale-95 focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-500"
          v-for="node in visibleNodes"
          :key="node.id"
          type="button"
          :aria-pressed="selectedId === node.id"
          @click="choose(node.id)"
        >
      <AeroDecor :orbs="false" />
          <span :class="'risk-badge risk-level-' + node.level">{{
            severityLabels[node.level]
          }}</span
          ><strong>{{ node.name }}</strong
          ><span>{{ riskSourceLabels[node.source] }}</span>
        </button>
      </section>
    </template>
  </template>
</template>
