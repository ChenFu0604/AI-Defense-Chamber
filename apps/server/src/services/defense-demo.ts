import type { DefenseSession, DefenseQuestion } from '@defense/shared'
import { judgeConfigs } from '../config/judges.js'

export function createDemoDefenseTurn(
  session: DefenseSession,
  judgeId: DefenseQuestion['judgeId'],
  answer: string | null,
) {
  const role = judgeConfigs.find((v) => v.id === judgeId)!
  const quote = answer?.slice(0, 40) ?? ''
  const templates = {
    business: [
      `你提到「${quote}」，谁会为这项价值付费？请说明预算来源与验证样本。`,
      `对于「${quote}」，请拆解获取一个用户的成本，以及哪些收入假设仍需试点。`,
      `如果「${quote}」未带来预期收入，何种资源安排能维持服务？请给出止损条件。`,
    ],
    technical: [
      `基于你说的「${quote}」，关键组件在哪个负载下会失效？准备如何测量容量边界？`,
      `围绕「${quote}」，请解释数据访问权限如何设计，如何测试权限绕过风险。`,
      `你回答「${quote}」，如果依赖服务不可用，系统怎样降级与恢复？`,
    ],
    user: [
      `你描述了「${quote}」，能否还原一位用户完成任务的具体步骤，并说明最容易放弃的位置？`,
      `针对「${quote}」，用户目前采用什么替代做法？请设计一次观察真实选择的访谈。`,
      `你说「${quote}」，首次使用者需要学习什么？准备如何对照评估操作成本？`,
    ],
    devil: [
      `你声称「${quote}」，这项论证隐藏了什么假设？请提出能推翻它的反例。`,
      `关于「${quote}」，哪些结论缺少直接证据？请给出可证伪的验证计划。`,
      `若「${quote}」只在特定条件成立，你准备怎样界定边界并修正承诺？`,
    ],
  }
  const index =
    session.messages.filter((v) => v.sender === 'judge' && v.judgeId === judgeId && v.assessment)
      .length % 3
  return {
    model: null,
    data: {
      question: {
        judgeId,
        question: answer
          ? '【模拟】' + templates[judgeId][index]
          : `【模拟】关于「${session.project.name}」，请从${role.dimensions[0]}说明你的主要依据。`,
        questionType: answer ? ('evidence' as const) : ('clarification' as const),
        riskLevel: 'medium' as const,
        focus: role.dimensions[0]!,
        rationale: '模拟规则模板，未调用模型，不代表真实分析。',
      },
      assessment: answer
        ? {
            answerQuote: quote,
            evaluation: 'unclear' as const,
            feedback: '模拟演示：仅引用最新回答，展示追问链路，不评判回答质量。',
            nextStrategy: 'probe_evidence' as const,
            risks: [],
          }
        : null,
    },
  }
}
