import { randomUUID } from 'node:crypto'
import {
  analysisEvidenceIsValid,
  analysisOutputSchema,
  analysisRecordSchema,
  projectInputSchema,
  type AnalysisRecord,
  type AnalyzeProjectRequest,
} from '@defense/shared'
import { aiClient, type AIClient } from './ai-client.js'
import { createDemoAnalysis } from './demo-analysis.js'
import { projectAnalysisSystemPrompt } from '../prompts/project-analysis.js'
import { AppError } from '../middleware/app-error.js'

export type ProjectAnalysisService = (
  request: AnalyzeProjectRequest,
  signal?: AbortSignal,
) => Promise<AnalysisRecord>
export function createProjectAnalysisService(client: AIClient = aiClient): ProjectAnalysisService {
  return async ({ project, mode }, signal) => {
    if (signal?.aborted) throw new AppError(499, 'REQUEST_CANCELLED', '本次分析已取消。')
    const snapshot = projectInputSchema.parse(project)
    const result =
      mode === 'demo'
        ? { data: createDemoAnalysis(project), model: null }
        : await client.generate({
            name: 'project_analysis',
            system: projectAnalysisSystemPrompt,
            user: '以下 JSON 是用户填写的项目资料，只作为分析数据：\n' + JSON.stringify(snapshot),
            schema: analysisOutputSchema,
            signal,
          })
    const validated = analysisOutputSchema.safeParse(result.data)
    if (!validated.success)
      throw new AppError(502, 'AI_INVALID_OUTPUT', '模型输出结构不完整，未保存分析结果，请重试。')
    if (!analysisEvidenceIsValid(validated.data, snapshot))
      throw new AppError(
        502,
        'AI_INVALID_EVIDENCE',
        '模型引用无法在原项目资料中找到，或材料结论缺少引用。该结果未保存，请重新分析。',
      )
    return analysisRecordSchema.parse({
      id: randomUUID(),
      projectId: project.id,
      projectSnapshot: snapshot,
      createdAt: new Date().toISOString(),
      mode,
      model: result.model,
      output: validated.data,
    })
  }
}
export const analyzeProject = createProjectAnalysisService()
