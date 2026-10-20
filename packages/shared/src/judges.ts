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
    introduction: '检验真实需求、市场边界与价值的可持续性。',
    icon: 'business',
    color: 'mint',
    dimensions: ['市场需求', '目标用户', '商业模式', '竞争优势', '获客成本与可持续性'],
    strategy:
      '优先从画像中的市场证据缺口切入，要求说明付费主体、替代方案与单位经济模型。公益项目关注资源与服务持续性。',
    followUpRules: [
      '缺少市场数据时追问样本与验证方式',
      '收益假设含糊时追问成本、转化和留存',
      '不把商业预测视为已验证事实',
    ],
    initialStatus: 'waiting',
  },
  {
    id: 'technical',
    name: '技术评委',
    introduction: '审视架构取舍、落地难点与系统可靠性。',
    icon: 'technology',
    color: 'cyan',
    dimensions: ['技术可行性', '系统架构', '实现难点', '数据安全与稳定性', '技术与需求匹配'],
    strategy: '围绕关键链路选择一个架构决策，追问约束、失败场景、容量与验证实验，避免堆砌术语。',
    followUpRules: [
      '方案缺少边界时追问容量与降级',
      '声称安全可靠时追问威胁模型与测试证据',
      '区分已实现能力和计划实现能力',
    ],
    initialStatus: 'waiting',
  },
  {
    id: 'user',
    name: '用户评委',
    introduction: '从真实使用场景检验痛点、体验与选择理由。',
    icon: 'user',
    color: 'violet',
    dimensions: ['真实痛点', '使用意愿', '操作流程', '选择理由', '差异化价值'],
    strategy:
      '从一个具体用户任务出发，追问现有做法、首次使用阻力与任务完成情况，避免替用户断言需求。',
    followUpRules: [
      '用户画像泛化时追问具体场景',
      '声称体验更好时追问观察记录与对照',
      '关注可访问性、学习成本与退出原因',
    ],
    initialStatus: 'waiting',
  },
  {
    id: 'devil',
    name: '魔鬼评委',
    introduction: '检验论证链条，暴露证据缺口和隐含假设。',
    icon: 'devil',
    color: 'rose',
    dimensions: ['逻辑漏洞', '证据缺口', '前后矛盾', '隐含假设', '遗漏风险', '含糊表述'],
    strategy: '选择影响结论最大的未证假设，提出反例和可证伪条件；只有材料确实冲突时才指出矛盾。',
    followUpRules: [
      '回答回避关键条件时追问可量化边界',
      '对结论要求证据链或反证实验',
      '保持专业，不做人身攻击，不编造矛盾',
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
