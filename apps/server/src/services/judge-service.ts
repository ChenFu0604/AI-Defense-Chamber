import { randomUUID } from 'node:crypto'
import {
  judgeQuestionSchema,
  judgeStatementSchema,
  questionsAreSimilar,
  type JudgeQuestion,
  type JudgeQuestionRequest,
  type JudgeStatement,
} from '@defense/shared'
import { judgeConfigs } from '../config/judges.js'
import { aiClient, type AIClient } from './ai-client.js'
import { AppError } from '../middleware/app-error.js'

export type JudgeService = (
  request: JudgeQuestionRequest,
  signal?: AbortSignal,
) => Promise<JudgeStatement>
function demoQuestion(request: JudgeQuestionRequest): JudgeQuestion {
  const { project, judgeId, history, analysis } = request
  const candidates = {
    business: [
      [
        '需求样本',
        `针对「${project.name}」，如何验证「${project.valueProposition.slice(0, 90)}」能持续创造价值？请给出样本和成本依据。`,
      ],
      [
        '付费主体',
        `你打算向谁收费，或由谁持续承担投入？针对「${project.targetUsers.slice(0, 80)}」，请区分使用者与付款方，并说明如何验证预算。`,
      ],
      [
        '竞争替代',
        `如果同类服务免费，「${project.name}」依靠什么获得客户？请给出替代方案、获客渠道与可承受的获客成本。`,
      ],
    ],
    technical: [
      [
        '关键链路',
        `在「${project.technicalPlan.slice(0, 90)}」方案中，关键链路如何支持「${project.coreFeatures.slice(0, 70)}」的可靠交付？准备怎样测试？`,
      ],
      [
        '权限隔离',
        `面向「${project.targetUsers.slice(0, 80)}」，你会如何划分数据访问权限？请解释鉴权失效时的泄露边界与验证办法。`,
      ],
      [
        '故障恢复',
        `「${project.name}」的核心依赖发生故障后，哪些操作需要降级？请说明恢复目标、备份与故障演练方法。`,
      ],
    ],
    user: [
      [
        '任务场景',
        `对于「${project.targetUsers.slice(0, 90)}」，完成「${project.coreFeatures.slice(0, 70)}」时，为什么愿意选择「${project.name}」？`,
      ],
      [
        '首次使用',
        `新用户第一次接触「${project.name}」需要经过哪些步骤才能获得价值？你会怎样观察并降低学习成本？`,
      ],
      [
        '替代习惯',
        `若用户继续沿用现有方式而不采用你的产品，最可能的阻力是什么？请设计一次观察真实选择的对照访谈。`,
      ],
    ],
    devil: [
      [
        '关键假设',
        `「${project.name}」中「${analysis.output.coreValue.summary.slice(0, 100)}」这一结论依赖哪些假设？出现什么反例时你会修正它？`,
      ],
      [
        '证据链条',
        `对于「${project.valueProposition.slice(0, 80)}」，你最缺少哪条直接证据？在取得它之前，哪些承诺需要收回或降低确定性？`,
      ],
      [
        '失败边界',
        `假设「${project.name}」试点没有达到预期，你会用什么可量化条件判断应继续投入、调整方向还是停止？`,
      ],
    ],
  }[judgeId]
  const candidate = candidates.find(
    (item) =>
      !history.some((previous) => questionsAreSimilar(previous.question, '【模拟】' + item[1])),
  )
  if (!candidate)
    throw new AppError(
      422,
      'DEMO_QUESTIONS_EXHAUSTED',
      '该评委的模拟模板已用完，请清空本轮或选择其他评委。',
    )
  const [focus, content] = candidate as [string, string]
  return {
    judgeId,
    question: '【模拟】' + content,
    focus,
    questionType:
      judgeId === 'technical' ? 'feasibility' : judgeId === 'devil' ? 'challenge' : 'evidence',
    riskLevel: 'medium',
    rationale: '模拟模板：用于演示角色视角和状态，不代表模型判断或已验证风险。',
  }
}
export function createJudgeService(client: AIClient = aiClient): JudgeService {
  return async (request, signal) => {
    if (signal?.aborted) throw new AppError(499, 'REQUEST_CANCELLED', '本次提问已取消。')
    const judge = judgeConfigs.find((item) => item.id === request.judgeId)!
    const result =
      request.mode === 'demo'
        ? { data: demoQuestion(request), model: null }
        : await client.generate({
            name: 'judge_question',
            system: judge.systemPrompt,
            user: JSON.stringify({
              judgeId: request.judgeId,
              project: request.project,
              profile: request.analysis.output,
              history: request.history,
            }),
            schema: judgeQuestionSchema,
            signal,
          })
    if (signal?.aborted) throw new AppError(499, 'REQUEST_CANCELLED', '本次提问已取消。')
    const parsed = judgeQuestionSchema.safeParse(result.data)
    if (!parsed.success || parsed.data.judgeId !== request.judgeId)
      throw new AppError(502, 'AI_INVALID_OUTPUT', '评委响应结构或角色不正确，请重试。')
    if (request.history.some((item) => questionsAreSimilar(item.question, parsed.data.question)))
      throw new AppError(
        422,
        'DUPLICATE_QUESTION',
        '问题与已有提问过于相似，未加入本轮。请重试或选择其他评委。',
      )
    return judgeStatementSchema.parse({
      id: randomUUID(),
      projectId: request.project.id,
      analysisId: request.analysis.id,
      createdAt: new Date().toISOString(),
      mode: request.mode,
      model: result.model,
      speech: parsed.data,
    })
  }
}
export const askJudge = createJudgeService()
