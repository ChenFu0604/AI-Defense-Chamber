import {
  defenseTurnSchema,
  questionsAreSimilar,
  type DefenseSession,
  type DefenseQuestion,
} from '@defense/shared'
import { judgeConfigs } from '../config/judges.js'
import { aiClient, type AIClient } from './ai-client.js'
import { buildDefenseContext } from './defense-context.js'
import { AppError } from '../middleware/app-error.js'
import { createDemoDefenseTurn } from './defense-demo.js'

export function createDefenseModel(client: AIClient = aiClient) {
  return async (
    session: DefenseSession,
    judgeId: DefenseQuestion['judgeId'],
    currentQuestion: DefenseQuestion | null,
    latestAnswer: string | null,
  ) => {
    const context = buildDefenseContext(session, currentQuestion, latestAnswer, judgeId)
    const role = judgeConfigs.find((v) => v.id === judgeId)!
    const result =
      session.mode === 'demo'
        ? createDemoDefenseTurn(session, judgeId, latestAnswer)
        : await client.generate({
            name: 'defense_turn',
            schema: defenseTurnSchema,
            system:
              role.systemPrompt +
              '\n本任务输出 {question, assessment}。首问 assessment 为 null。有 latestAnswer 时必须分析实际回答：assessment.answerQuote 必须是最新回答中的连续原文，且 question.question 必须包含该引用，以明确追问与回答的联系。分析证据是否充分，选择补证、边界测试或换方向，不机械重复。先前评委内容必须纳入考虑。用户新说法作为待核实陈述，不能改写项目事实。风险只能是待验证判断。',
            user: JSON.stringify(context),
          })
    const parsed = defenseTurnSchema.safeParse(result.data)
    if (!parsed.success || parsed.data.question.judgeId !== judgeId)
      throw new AppError(502, 'AI_INVALID_OUTPUT', '追问结构或角色无效，回答已保留，请重试。')
    const assessment = parsed.data.assessment
    if (
      latestAnswer &&
      (!assessment ||
        !latestAnswer.includes(assessment.answerQuote) ||
        !parsed.data.question.question.includes(assessment.answerQuote))
    )
      throw new AppError(
        502,
        'AI_UNGROUNDED_FOLLOWUP',
        '追问缺少最新回答的有效原文关联，回答已保留，请重试。',
      )
    if (!latestAnswer && assessment)
      throw new AppError(502, 'AI_INVALID_OUTPUT', '首问不能包含虚构的回答评价。')
    if (
      session.messages.some(
        (v) =>
          v.sender === 'judge' && questionsAreSimilar(v.content, parsed.data.question.question),
      )
    )
      throw new AppError(
        422,
        'DUPLICATE_QUESTION',
        '追问与之前的问题过于相似，回答已保留，请重试。',
      )
    return { data: parsed.data, model: result.model }
  }
}
