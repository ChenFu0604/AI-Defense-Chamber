import {
  calculateOverallScore,
  legacyReportOutputSchema,
  reportDimensionIds,
  type CurrentDefenseReport,
  type LegacyDefenseReport,
  type ReportOutput,
} from '../../packages/shared/src/report.js'
import { defenseFixture } from './defense.js'

export const reportAnswerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const reportQuestionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
export const reportQuote = '计划访谈二十名学生'
export function endedReportSession() {
  const session = defenseFixture()
  const question = {
    judgeId: 'business' as const,
    question: '如何核对校园用户需求？',
    questionType: 'evidence' as const,
    riskLevel: 'medium' as const,
    focus: '需求验证',
    rationale: '需要可核对的材料。',
  }
  session.status = 'ended'
  session.endedAt = '2026-10-20T10:01:00.000Z'
  session.currentQuestionId = reportQuestionId
  session.messages = [
    {
      id: reportQuestionId,
      sender: 'judge',
      content: question.question,
      createdAt: session.createdAt,
      judgeId: 'business',
      status: 'answered',
      question,
      assessment: null,
      replyTo: null,
      requestId: session.id,
      model: 'fixture-model',
    },
    {
      id: reportAnswerId,
      sender: 'user',
      content: '我们计划访谈二十名学生，记录原始需求，目前尚未完成试点。',
      createdAt: session.endedAt,
      judgeId: 'business',
      status: 'sent',
      question: null,
      assessment: null,
      replyTo: reportQuestionId,
      requestId: reportAnswerId,
      model: null,
    },
  ]
  return session
}
export function reportOutputFixture(): ReportOutput {
  const references = [{ messageId: reportAnswerId, quote: reportQuote }]
  const finding = { title: '测试发现', detail: '已提出验证计划，但尚未提供试点结果。', references }
  const dimension = (score: number) => ({
    status: 'assessed' as const,
    score,
    reason: '固定测试评分，用于协议、图表和持久化断言，不代表实际模型评价。',
    references,
  })
  return {
    summary: '测试评价：回答描述了需求验证计划，仍需实际数据支撑。',
    limitations: '仅一条回答，缺少技术与多轮应变观察，属于有限样本估计。',
    dimensions: {
      logic: dimension(71),
      evidence: dimension(52),
      technical: dimension(64),
      value: dimension(59),
      adaptability: dimension(66),
    },
    strengths: [finding],
    weaknesses: [finding],
    evidenceGaps: [{ ...finding, neededEvidence: '访谈提纲与匿名原始记录。' }],
    priorities: [{ ...finding, priority: 'high' }],
    improvements: [
      {
        title: '完成小规模需求访谈',
        action: '执行访谈计划并整理不同需求。',
        acceptanceCriteria: '提供匿名访谈记录与需求分类汇总。',
        dimension: 'evidence',
        priority: 'high',
        references,
      },
    ],
  }
}
export function reportFixture(): CurrentDefenseReport {
  const session = endedReportSession(),
    output = reportOutputFixture()
  return {
    version: 2,
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    sessionId: session.id,
    projectId: session.project.id,
    createdAt: session.endedAt!,
    mode: 'live',
    model: 'fixture-model',
    sourceFingerprint: 'a'.repeat(64),
    answerCount: 1,
    overallScore: calculateOverallScore(output.dimensions),
    output,
  }
}
export function legacyReportFixture(): LegacyDefenseReport {
  const report = reportFixture()
  const dimensions = Object.fromEntries(reportDimensionIds.map(id => {
    const { status: _status, ...saved } = report.output.dimensions[id]
    return [id, saved]
  }))
  return {
    ...report,
    version: 1,
    overallScore: report.overallScore!,
    output: legacyReportOutputSchema.parse({ ...report.output, dimensions }),
  }
}
