import {
  defenseTurnSchema,
  discussionTurnSchema,
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
import { availableTopics, discussionPlan } from './defense-discussion.js'
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
    const demo = session.mode === 'demo' ? createDemoDefenseTurn(session, judgeId, latestAnswer) : null
    const result = demo ?? await client.generate<unknown>({
            name: 'defense_turn',
            schema: session.discussion ? discussionTurnSchema : defenseTurnSchema,
            system: role.systemPrompt + '\n' + defenseTurnSystemPrompt,
            images: materials.images,
            user: JSON.stringify(context),
          })
    let raw: unknown = result.data
    if (session.discussion && demo) {
      const assessment = demo.data.assessment
      const candidates = availableTopics(session, assessment)
      const selected = candidates.includes(discussionPlan(session)!.recommendedTopicId!) ? discussionPlan(session)!.recommendedTopicId! : candidates[0]
      const topic = session.discussion.topics.find(t => t.id === selected)
      const wording = {
        needs: ['哪一类人最常遇到这个麻烦？请讲一个具体场景。', '如果先找一人试用，你最想观察哪个费劲的步骤？', '重新看看使用场景，你想先缩小哪一类用户的范围？', '哪些人可能并不需要它？你准备怎样了解原因？'],
        solution: ['准备先做出哪个能试用的小功能？', '如果这个功能失败，你希望系统怎样保留用户的操作？', '回头看实现方案，哪一步可以暂时手工完成以便先试用？', '准备怎样测试这个功能在数据不完整时的表现？'],
        value: ['用户用它之后，哪件事会变得更省力？', '你准备怎样比较使用前后的一次实际任务？', '重新讨论价值时，你最想先验证哪一个效果？', '假如用户继续使用原来的办法，你怎样了解他们的顾虑？'],
        assumptions: ['项目中哪一句判断你还没有把握？', '出现什么结果时，你会调整这个判断？', '再看这些假设，你愿意先做哪个成本最低的小测试？', '如果测试结果和预期不同，你准备优先改哪一部分？'],
      }
      raw = {...demo.data, topicId: selected ?? null, question: topic ? {
        ...demo.data.question, question: `【模拟 · ${topic.title}】${wording[topic.id][Math.min(topic.questionIds.length, 3)]}`,
        focus: topic.title,
      } : null}
    }
    const parsed = (session.discussion ? discussionTurnSchema : defenseTurnSchema).safeParse(raw)
    if (!parsed.success || (parsed.data.question && parsed.data.question.judgeId !== judgeId))
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
    if (session.discussion) {
      const candidates = availableTopics(session, assessment)
      const topicId = 'topicId' in parsed.data ? parsed.data.topicId : null
      if (parsed.data.question ? !topicId || !candidates.includes(topicId) : topicId !== null || !latestAnswer || !assessment || candidates.length > 0)
        throw new AppError(502, 'AI_INVALID_TOPIC', '评委选择了已关闭、超出追问上限或不匹配的议题，原回答已保留，请重试。')
    }
    if (parsed.data.question &&
      session.messages.some(
        (v) =>
          v.sender === 'judge' && questionsAreSimilar(v.content, parsed.data.question!.question),
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
