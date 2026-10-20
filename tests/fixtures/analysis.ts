import {
  createProjectRecord,
  type AnalysisMode,
  type AnalysisOutput,
  type AnalysisRecord,
} from '@defense/shared'

export const analysisProject = createProjectRecord(
  {
    name: '校园节能助手',
    description: '宿舍能源使用建议工具，目前完成原型，尚未试点。',
    projectType: 'research',
    targetUsers: '住校学生与后勤管理人员',
    coreFeatures: '能耗展示、节能建议与反馈记录',
    technicalPlan: 'Vue 前端与 Node.js API，采集方案待验证。',
    valueProposition: '计划通过访谈和试点验证节能价值，暂无真实效果数据。',
    difficulty: 'advanced',
  },
  '33333333-3333-4333-8333-333333333333',
  '2026-10-20T03:00:00.000Z',
)

export function validAnalysisOutput(): AnalysisOutput {
  return {
    coreValue: {
      summary: '材料提出了节能价值假设。',
      reasoning: '用户明确表示仍需验证。',
      certainty: 'provided',
      evidence: [{ field: 'valueProposition', quote: '计划通过访谈和试点验证节能价值' }],
    },
    targetUsersAndScenarios: [
      {
        summary: '住校学生可能关注宿舍能源使用。',
        reasoning: '具体使用意愿仍需访谈验证。',
        certainty: 'inferred',
        evidence: [{ field: 'targetUsers', quote: '住校学生' }],
      },
    ],
    strengths: [],
    technicalFeasibility: {
      summary: '原型技术选型已说明，采集可行性证据不足。',
      reasoning: '材料没有提供采集验证记录。',
      certainty: 'insufficient',
      evidence: [{ field: 'technicalPlan', quote: '采集方案待验证' }],
    },
    businessValue: {
      summary: '应用价值需要试点支持。',
      reasoning: '材料说明尚无真实效果数据。',
      certainty: 'insufficient',
      evidence: [{ field: 'valueProposition', quote: '暂无真实效果数据' }],
    },
    risks: [
      {
        title: '采集方案尚待验证',
        summary: '采集可用性可能影响应用效果。',
        reasoning: '属于基于材料提出的推测。',
        certainty: 'inferred',
        evidence: [{ field: 'technicalPlan', quote: '采集方案待验证' }],
        severity: 'high',
        suggestion: '先做单个场景的采集验证。',
      },
    ],
    evidenceGaps: [
      {
        topic: '采集验证',
        missingEvidence: '材料没有说明采集试验结果，不等于现实中没有进行过试验。',
        suggestedAction: '补充试验记录和局限。',
      },
    ],
    questionDirections: [
      {
        judge: 'technical',
        topic: '方案验证',
        question: '你如何验证采集方案可用？',
        reason: '材料明确注明该方案待验证。',
      },
    ],
  }
}
export function analysisFixture(mode: AnalysisMode = 'live'): AnalysisRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    projectId: analysisProject.id,
    projectSnapshot: {
      name: analysisProject.name,
      description: analysisProject.description,
      projectType: analysisProject.projectType,
      targetUsers: analysisProject.targetUsers,
      coreFeatures: analysisProject.coreFeatures,
      technicalPlan: analysisProject.technicalPlan,
      valueProposition: analysisProject.valueProposition,
      difficulty: analysisProject.difficulty,
    },
    mode,
    model: mode === 'live' ? 'test-model' : null,
    createdAt: '2026-10-20T04:00:00.000Z',
    output: validAnalysisOutput(),
  }
}
