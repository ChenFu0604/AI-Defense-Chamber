import { z } from 'zod'

export const projectTypes = ['innovation', 'research', 'graduation', 'pitch', 'other'] as const
export const defenseDifficulties = ['normal', 'advanced', 'pressure'] as const

export const projectTypeLabels: Record<ProjectType, string> = {
  innovation: '创新创业项目',
  research: '大创项目',
  graduation: '毕业设计',
  pitch: '产品路演',
  other: '其他',
}
export const difficultyLabels: Record<DefenseDifficulty, string> = {
  normal: '普通',
  advanced: '进阶',
  pressure: '高压',
}
export const difficultyDescriptions: Record<DefenseDifficulty, string> = {
  normal: '从核心价值与基本方案开始，循序梳理项目。',
  advanced: '聚焦设计取舍、实现细节与论证依据。',
  pressure: '围绕薄弱假设和证据缺口，准备连续追问。',
}

export const projectFieldLabels = {
  name: '项目名称',
  description: '项目简介',
  projectType: '项目类型',
  targetUsers: '目标用户',
  coreFeatures: '核心功能',
  technicalPlan: '技术方案',
  valueProposition: '商业模式或应用价值',
  difficulty: '答辩难度',
} as const

export const projectTextLimits = {
  name: 80,
  description: 4000,
  targetUsers: 1000,
  coreFeatures: 3000,
  technicalPlan: 3000,
  valueProposition: 2000,
} as const

function requiredText(label: string, max: number) {
  return z
    .string({ error: `请填写${label}。` })
    .trim()
    .min(1, `请填写${label}。`)
    .max(max, `${label}不能超过 ${max} 字。`)
}

export const projectInputSchema = z.object({
  name: requiredText(projectFieldLabels.name, projectTextLimits.name),
  description: requiredText(projectFieldLabels.description, projectTextLimits.description),
  projectType: z.enum(projectTypes, { error: '请选择有效的项目类型。' }),
  targetUsers: requiredText(projectFieldLabels.targetUsers, projectTextLimits.targetUsers),
  coreFeatures: requiredText(projectFieldLabels.coreFeatures, projectTextLimits.coreFeatures),
  technicalPlan: requiredText(projectFieldLabels.technicalPlan, projectTextLimits.technicalPlan),
  valueProposition: requiredText(
    projectFieldLabels.valueProposition,
    projectTextLimits.valueProposition,
  ),
  difficulty: z.enum(defenseDifficulties, { error: '请选择有效的答辩难度。' }),
})

export const projectSchema = projectInputSchema
  .extend({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine((project) => Date.parse(project.updatedAt) >= Date.parse(project.createdAt), {
    message: '项目更新时间不能早于创建时间。',
  })

export const projectCollectionSchema = z
  .object({
    version: z.literal(1),
    projects: z.array(projectSchema),
  })
  .refine(
    ({ projects }) => new Set(projects.map((project) => project.id)).size === projects.length,
    {
      message: '项目记录存在重复标识。',
    },
  )

export type ProjectType = (typeof projectTypes)[number]
export type DefenseDifficulty = (typeof defenseDifficulties)[number]
export type ProjectInput = z.infer<typeof projectInputSchema>
export type Project = z.infer<typeof projectSchema>
export type ProjectField = keyof ProjectInput
export type ProjectFieldErrors = Partial<Record<ProjectField, string>>

export function validateProjectForm(
  input: unknown,
):
  | { success: true; data: ProjectInput; errors: ProjectFieldErrors }
  | { success: false; errors: ProjectFieldErrors } {
  const result = projectInputSchema.safeParse(input)
  if (result.success) return { success: true, data: result.data, errors: {} }
  const errors: ProjectFieldErrors = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0]
    if (
      typeof field === 'string' &&
      field in projectFieldLabels &&
      !errors[field as ProjectField]
    ) {
      errors[field as ProjectField] = issue.message
    }
  }
  return { success: false, errors }
}

export function createProjectRecord(input: unknown, id: string, timestamp: string): Project {
  return projectSchema.parse({
    ...projectInputSchema.parse(input),
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}
