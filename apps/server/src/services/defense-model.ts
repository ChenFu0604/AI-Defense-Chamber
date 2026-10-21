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
import { defenseTurnSystemPrompt } from '../prompts/defense-turn.js'
import { attachmentService, type AttachmentService } from './attachment-service.js'

export function createDefenseModel(
  client: AIClient = aiClient,
  attachments: AttachmentService = attachmentService,
) {
  return async (
    session: DefenseSession,
    judgeId: DefenseQuestion['judgeId'],
    currentQuestion: DefenseQuestion | null,
    latestAnswer: string | null,
  ) => {
    const latestFiles =
      session.messages.filter((m) => m.sender === 'user').at(-1)?.attachments ?? []
    const materials =
      session.mode === 'live'
        ? await attachments.materials([...latestFiles, ...(session.project.attachments ?? [])])
        : { images: [], documents: [] }
    const context = buildDefenseContext(
      session,
      currentQuestion,
      latestAnswer,
      judgeId,
      materials.documents,
    )
    const role = judgeConfigs.find((v) => v.id === judgeId)!
    const result =
      session.mode === 'demo'
        ? createDemoDefenseTurn(session, judgeId, latestAnswer)
        : await client.generate({
            name: 'defense_turn',
            schema: defenseTurnSchema,
            system: role.systemPrompt + '\n' + defenseTurnSystemPrompt,
            images: materials.images,
            user: JSON.stringify(context),
          })
    const parsed = defenseTurnSchema.safeParse(result.data)
    if (!parsed.success || parsed.data.question.judgeId !== judgeId)
      throw new AppError(502, 'AI_INVALID_OUTPUT', '追问结构或角色无效，回答已保留，请重试。')
    const assessment = parsed.data.assessment
    if (
      latestAnswer &&
      (!assessment || !latestAnswer.includes(assessment.answerQuote))
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
