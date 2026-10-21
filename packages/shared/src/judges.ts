import { z } from 'zod'
import { analysisRecordSchema, analysisMatchesProject } from './analysis.js'
import { projectSchema } from './project.js'

export const judgeIds = ['business', 'technical', 'user', 'devil'] as const
export type JudgeId = (typeof judgeIds)[number]
export type JudgeStatus = 'waiting' | 'analyzing' | 'questioning' | 'completed' | 'error'
export const judgeStatusLabels: Record<JudgeStatus, string> = {
  waiting: '等待',
  analyzing: '分析中',
  questioning: '提问中',
  completed: '完成',
  error: '失败',
}
export interface JudgeDefinition {
  id: JudgeId
  name: string
  introduction: string
  icon: 'business' | 'technology' | 'user' | 'devil'
  color: 'mint' | 'cyan' | 'violet' | 'rose'
  dimensions: readonly string[]
  strategy: string
  followUpRules: readonly string[]
  initialStatus: JudgeStatus
}
export const judgeDefinitions: readonly JudgeDefinition[] = [
  {
    id: 'business',
    name: '商业评委',
    introduction: '聊清楚谁需要、谁买单，以及项目怎样持续做下去。',
    icon: 'business',
    color: 'mint',
    dimensions: ['市场需求', '目标用户', '商业模式', '竞争优势', '获客成本与可持续性'],
    strategy:
      '从谁最需要这个项目开始，一次聊清一个实际问题：谁买单、花多少钱，或怎样找到第一批用户。非盈利项目关注谁提供资源。',
    followUpRules: [
      '还没接触用户时，先问准备找谁了解需求',
      '说能赚钱时，先问一笔收入能否覆盖对应的花费',
      '区分已经收到的钱与预计的收入，不强求非盈利项目收费',
    ],
    initialStatus: 'waiting',
  },
  {
    id: 'technical',
    name: '技术评委',
    introduction: '聊清楚怎么做、做到哪一步，以及出问题怎么办。',
    icon: 'technology',
    color: 'cyan',
    dimensions: ['技术可行性', '系统架构', '实现难点', '数据安全与稳定性', '技术与需求匹配'],
    strategy: '从一个核心功能怎样实现切入，再问实际遇到的困难或故障。先了解已做出的部分，再讨论下一步。',
    followUpRules: [
      '说能稳定运行时，问有没有试过多人使用或断网的情况',
      '说数据安全时，问怎样防止别人看到不属于自己的数据',
      '区分已经做出的功能和计划，不对早期原型强加大规模系统要求',
    ],
    initialStatus: 'waiting',
  },
  {
    id: 'user',
    name: '用户评委',
    introduction: '站在使用者一边，问好不好用、值不值得换过来。',
    icon: 'user',
    color: 'violet',
    dimensions: ['真实痛点', '使用意愿', '操作流程', '选择理由', '差异化价值'],
    strategy:
      '请用户讲一个具体使用场景，关注原来怎么做、现在是否更方便，以及第一次使用会在哪里卡住。',
    followUpRules: [
      '说人人都能用时，问最先服务哪一类人',
      '说更好用时，问一次真实试用中发生了什么',
      '关注第一次能否看懂操作，以及为什么可能放弃使用',
    ],
    initialStatus: 'waiting',
  },
  {
    id: 'devil',
    name: '魔鬼评委',
    introduction: '抓住说不清的地方，帮你提前应对最难的一问。',
    icon: 'devil',
    color: 'rose',
    dimensions: ['逻辑漏洞', '证据缺口', '前后矛盾', '隐含假设', '遗漏风险', '含糊表述'],
    strategy: '抓住一个最影响结论、但还没有说清的地方，用具体反例追问。只有资料确实冲突时才指出前后矛盾。',
    followUpRules: [
      '回答绕开问题时，平静指出还没回答的那一点',
      '对肯定的结论，问出现什么情况会让你改变判断',
      '可以直接质疑说法，但不挖苦、不做人身攻击、不编造矛盾',
    ],
    initialStatus: 'waiting',
  },
]

const text = (max: number) => z.string().trim().min(1).max(max)
export const judgeQuestionSchema = z.strictObject({
  judgeId: z.enum(judgeIds),
  question: text(800),
  questionType: z.enum(['clarification', 'evidence', 'feasibility', 'tradeoff', 'challenge']),
  riskLevel: z.enum(['low', 'medium', 'high']),
  focus: text(160),
  rationale: text(1000),
})
export type JudgeQuestion = z.infer<typeof judgeQuestionSchema>
export const judgeQuestionRequestSchema = z
  .strictObject({
    project: projectSchema,
    analysis: analysisRecordSchema,
    judgeId: z.enum(judgeIds),
    mode: z.enum(['live', 'demo']).default('live'),
    history: z.array(judgeQuestionSchema).max(32).default([]),
  })
  .superRefine((request, context) => {
    if (!analysisMatchesProject(request.analysis, request.project))
      context.addIssue({ code: 'custom', message: '画像与当前项目资料不一致，请重新分析。' })
    if (request.analysis.mode !== request.mode)
      context.addIssue({ code: 'custom', message: '真实提问需要真实画像，模拟提问需要模拟画像。' })
  })
export type JudgeQuestionRequest = z.infer<typeof judgeQuestionRequestSchema>
export const judgeStatementSchema = z
  .strictObject({
    id: z.uuid(),
    projectId: z.uuid(),
    analysisId: z.uuid(),
    createdAt: z.iso.datetime(),
    mode: z.enum(['live', 'demo']),
    model: text(200).nullable(),
    speech: judgeQuestionSchema,
  })
  .refine((record) => (record.mode === 'demo' ? record.model === null : record.model !== null), {
    message: '评委发言来源与模型信息不一致。',
  })
export type JudgeStatement = z.infer<typeof judgeStatementSchema>
export const judgeResponseSchema = z.strictObject({
  success: z.literal(true),
  data: judgeStatementSchema,
})
export const questionTypeLabels = {
  clarification: '澄清',
  evidence: '证据',
  feasibility: '可行性',
  tradeoff: '取舍',
  challenge: '质疑',
} as const

export function questionsAreSimilar(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\p{P}\p{S}\s]/gu, '')
  const left = normalize(a),
    right = normalize(b)
  if (left === right) return true
  const pairs = (value: string) =>
    new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, i) => value.slice(i, i + 2)))
  const x = pairs(left),
    y = pairs(right)
  if (!x.size || !y.size) return false
  const overlap = [...x].filter((pair) => y.has(pair)).length
  return (2 * overlap) / (x.size + y.size) >= 0.82
}
