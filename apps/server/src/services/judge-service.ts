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
import { attachmentService, type AttachmentService } from './attachment-service.js'

export type JudgeService = (
  request: JudgeQuestionRequest,
  signal?: AbortSignal,
) => Promise<JudgeStatement>
function demoQuestion(request: JudgeQuestionRequest): JudgeQuestion {
  const { project, judgeId, history } = request
  const candidates = {
    business: [
      [
        '需求样本',
        `关于「${project.name}」，你最想先帮哪一类人？可以先从最需要它的人想起。`,
      ],
      [
        '付费主体',
        `要让「${project.name}」持续做下去，你准备先找谁提供资金或其他支持？`,
      ],
      [
        '竞争替代',
        `可以先比较一种现有做法：「${project.name}」最值得别人换过来的理由是什么？`,
      ],
    ],
    technical: [
      [
        '关键链路',
        `「${project.name}」可以先做一个能试用的小版本，你会先选哪个核心功能？`,
      ],
      [
        '权限隔离',
        `对于「${project.name}」，可以用两个测试账号检查数据保护，你准备先检查什么？`,
      ],
      [
        '故障恢复',
        `假设「${project.name}」的一次操作失败了，你希望用户接下来还能做什么？`,
      ],
    ],
    user: [
      [
        '任务场景',
        `讲讲用户会在什么具体时刻打开「${project.name}」？从他当时的麻烦说起就行。`,
      ],
      [
        '首次使用',
        `第一次用「${project.name}」的人可能哪里看不懂？你最想先改哪一步？`,
      ],
      [
        '替代习惯',
        `可以请一位用户试试「${project.name}」，你最想观察哪个步骤是否比原来省事？`,
      ],
    ],
    devil: [
      [
        '关键假设',
        `对于「${project.name}」，哪一句判断你还没验证过？可以先挑最影响成败的一句。`,
      ],
      [
        '证据链条',
        `怎样的小测试会让你发现「${project.name}」可能没想象中有用？先想一个就行。`,
      ],
      [
        '失败边界',
        `假设「${project.name}」的第一次试用效果不好，你会先改哪里？`,
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
export function createJudgeService(
  client: AIClient = aiClient,
  attachments: AttachmentService = attachmentService,
): JudgeService {
  return async (request, signal) => {
    if (signal?.aborted) throw new AppError(499, 'REQUEST_CANCELLED', '本次提问已取消。')
    const judge = judgeConfigs.find((item) => item.id === request.judgeId)!
    const materials =
      request.mode === 'live'
        ? await attachments.materials(request.project.attachments)
        : { images: [], documents: [] }
    const result =
      request.mode === 'demo'
        ? { data: demoQuestion(request), model: null }
        : await client.generate({
            name: 'judge_question',
            system: judge.systemPrompt,
            user: JSON.stringify({
              judgeId: request.judgeId,
              project: {
                ...request.project,
                attachments: request.project.attachments?.map(({ id, name }) => ({ id, name })),
              },
              materials: materials.documents,
              profile: request.analysis.output,
              history: request.history,
            }),
            schema: judgeQuestionSchema,
            signal,
            images: materials.images,
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
