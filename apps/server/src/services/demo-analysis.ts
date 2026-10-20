import type { AnalysisOutput, AnalysisFinding, Project } from '@defense/shared'

export function createDemoAnalysis(project: Project): AnalysisOutput {
  const finding = (
    summary: string,
    field: 'description' | 'targetUsers' | 'coreFeatures' | 'technicalPlan' | 'valueProposition',
    certainty: AnalysisFinding['certainty'] = 'inferred',
  ): AnalysisFinding => ({
    summary: '模拟示例：' + summary,
    reasoning:
      '这是预置模板，用于演示展示结构，不是模型分析或事实验证。请人工核对与当前项目是否相符。',
    certainty,
    evidence: [{ field, quote: project[field].slice(0, 140) }],
  })
  return {
    coreValue: finding(
      '可将填写的应用价值作为答辩陈述起点，并进一步说明可衡量的价值。',
      'valueProposition',
      'provided',
    ),
    targetUsersAndScenarios: [
      finding('围绕填写的目标用户，补充具体场景与现有替代方案。', 'targetUsers'),
    ],
    strengths: [
      finding('已列出核心功能，可据此核对实现范围与优先级。', 'coreFeatures', 'provided'),
    ],
    technicalFeasibility: finding(
      '可围绕架构选择、实现成本和验证计划继续准备，模板不能判断方案可行性。',
      'technicalPlan',
      'insufficient',
    ),
    businessValue: finding(
      '将价值假设与已经取得的证据分开表达。',
      'valueProposition',
      'insufficient',
    ),
    risks: [
      {
        ...finding(
          '用户需求是否得到验证，可以作为一项待核对的风险方向；这不表示本项目一定存在该风险。',
          'description',
        ),
        title: '模拟风险示例 · 需求验证',
        severity: 'medium',
        suggestion: '模拟建议：核对是否已有用户访谈或试点数据；若没有，再安排验证。',
      },
    ],
    evidenceGaps: [
      {
        topic: '模拟证据示例 · 试点与反馈',
        missingEvidence:
          '模板仅展示证据缺口的结构，不认定资料缺失。可核对当前是否已提供访谈、试点和效果对比。',
        suggestedAction: '列出已有材料及来源，再为尚未提供的部分制定补充计划。',
      },
    ],
    questionDirections: [
      {
        judge: 'business',
        topic: '模拟 · 价值验证',
        question: '你准备如何验证用户会持续选择这个项目？',
        reason: '静态商业视角示例，不是模型提问。',
      },
      {
        judge: 'technical',
        topic: '模拟 · 技术取舍',
        question: '核心技术选择有哪些替代方案，为什么这样取舍？',
        reason: '静态技术视角示例，不是模型提问。',
      },
      {
        judge: 'user',
        topic: '模拟 · 使用场景',
        question: '用户在什么具体场景中会需要它？',
        reason: '静态用户视角示例，不是模型提问。',
      },
      {
        judge: 'devil',
        topic: '模拟 · 论证依据',
        question: '哪项核心假设目前最缺乏证据？',
        reason: '静态逻辑视角示例，不是模型提问。',
      },
    ],
  }
}
