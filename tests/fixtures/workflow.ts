import { join } from 'node:path'
import { reportReferences, type JudgeId } from '@defense/shared'
import { createApp } from '../../apps/server/src/app.js'
import { createAIClient } from '../../apps/server/src/services/ai-client.js'
import { createProjectAnalysisService } from '../../apps/server/src/services/project-analysis-service.js'
import { createDefenseService } from '../../apps/server/src/services/defense-service.js'
import { createDefenseModel } from '../../apps/server/src/services/defense-model.js'
import { createAssistanceModel, createClosingAssessmentModel } from '../../apps/server/src/services/defense-guidance.js'
import { createDefenseRepository } from '../../apps/server/src/services/defense-repository.js'
import { createReportRepository } from '../../apps/server/src/services/report-repository.js'
import { createReportService } from '../../apps/server/src/services/report-service.js'
import { validAnalysisOutput } from './analysis.js'
import { reportOutputFixture } from './report.js'
import { createModelSettingsService } from '../../apps/server/src/services/model-settings-service.js'
import { createAttachmentService } from '../../apps/server/src/services/attachment-service.js'

/** Local test adapter only: exercises the real JSON client without network/model access. */
export function createWorkflowFixture(directory: string, options: { turnDelayMs?: number } = {}) {
  const calls = { project_analysis: 0, defense_turn: 0, defense_report: 0, defense_assistance: 0, defense_assessment: 0 }
  const modelInputs: { task: string; images: number; context: Record<string, unknown> }[] = []
  const failedAnswers = new Set<string>()
  const failures = new Map<string, 'http' | 'invalid'>()
  const client = createAIClient(
    {
      baseUrl: 'http://fixture.invalid/v1',
      apiKey: 'fixture-only',
      model: '测试固定响应-非真实模型',
      timeoutMs: Math.max(1000, (options.turnDelayMs ?? 0) + 1000),
      responseFormat: 'json_schema',
    },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      const task = body.response_format.json_schema.name as keyof typeof calls
      if (task === 'defense_turn' && options.turnDelayMs)
        await new Promise((resolve) => setTimeout(resolve, options.turnDelayMs))
      calls[task]++
      const content = body.messages[1].content
      const input = (typeof content === 'string' ? content : content[0].text) as string
      const context = JSON.parse(input.slice(input.indexOf('{')))
      modelInputs.push({
        task,
        images:
          typeof content === 'string'
            ? 0
            : content.filter((part: { type: string }) => part.type === 'image_url').length,
        context,
      })
      const failure = failures.get(task)
      failures.delete(task)
      if (failure === 'http') return new Response('{}', { status: 503 })
      if (failure === 'invalid')
        return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }))
      let output: unknown
      if (task === 'project_analysis') {
        const analysis = validAnalysisOutput()
        analysis.coreValue.summary = '【测试数据】固定项目画像，仅用于流程验收。'
        // Rebind fixture citations to the actual test form; never invent project evidence.
        const statements = [
          analysis.coreValue,
          ...analysis.targetUsersAndScenarios,
          analysis.technicalFeasibility,
          analysis.businessValue,
          ...analysis.risks,
        ]
        for (const statement of statements)
          for (const reference of statement.evidence)
            reference.quote = context[reference.field].slice(0, 100)
        output = analysis
      } else if (task === 'defense_turn') {
        const answer: string | null = context.latestAnswer
        if (answer?.includes('[测试失败一次]') && !failedAnswers.has(answer)) {
          failedAnswers.add(answer)
          return new Response('{}', { status: 503 })
        }
        const quote = answer?.slice(0, 120)
        const judgeId: JudgeId = context.judgeId
        const topics = {
          business: '需求与付费意愿',
          technical: '采集准确性与故障边界',
          user: '实际使用流程',
          devil: '假设与反例',
        }
        output = {
          question: {
            judgeId,
            question: answer
              ? `【测试数据】${topics[judgeId]}：你提到「${quote}」，下一步怎样验证？本轮记录 ${context.earlierQuestions.length + 1}。`
              : `【测试数据】请说明${topics[judgeId]}有哪些待验证证据？`,
            questionType: 'evidence',
            riskLevel: 'medium',
            focus: topics[judgeId],
            rationale: '固定测试响应，不代表模型推理。',
          },
          assessment: answer
            ? {
                answerQuote: quote,
                evaluation: 'evidence_missing',
                feedback: '【测试数据】请补充可核对的原始记录。',
                nextStrategy: 'probe_evidence',
                risks: [],
              }
            : null,
        }
      } else if (task === 'defense_assistance') {
        output = { content: '【测试数据】可以先回想一位实际遇到这个问题的人，说明当时最麻烦的一步；尚未验证的部分如实说明。' }
      } else if (task === 'defense_assessment') {
        output = { answerQuote: context.latestAnswer.slice(0, 100), evaluation: 'unclear', feedback: '【测试数据】最后回答已保存，建议下一步做小范围验证。', nextStrategy: 'change_direction', risks: [] }
      } else if (task === 'defense_report') {
        const report = reportOutputFixture()
        report.summary = '【测试数据】固定评分用于图表与历史验收，不能代表真实能力。'
        for (const reference of reportReferences(report)) {
          reference.messageId = context.answers[0].messageId
          reference.quote = context.answers[0].answer.slice(0, 100)
        }
        output = report
      } else throw new Error('Unexpected fixture task: ' + task)
      return new Response(
        JSON.stringify({
          model: '测试固定响应-非真实模型',
          choices: [{ message: { content: JSON.stringify(output) }, finish_reason: 'stop' }],
        }),
      )
    },
  )
  const repository = createDefenseRepository(join(directory, 'sessions'))
  const reportRepository = createReportRepository(join(directory, 'reports'))
  const attachments = createAttachmentService(join(directory, 'attachments'))
  const defense = createDefenseService(
    repository,
    createDefenseModel(client, attachments),
    reportRepository,
    attachments,
    { assistance: createAssistanceModel(client), closing: createClosingAssessmentModel(client, attachments) },
  )
  const reports = createReportService(defense, reportRepository, client, attachments)
  const app = createApp({
    analyzeProject: createProjectAnalysisService(client, attachments),
    attachments,
    defense,
    reports,
    askJudge: async () => {
      throw new Error('Single-judge preview is outside this fixture workflow')
    },
    // Test server never reads or writes the user's model configuration.
    modelSettings: createModelSettingsService({
      path: join(directory, 'model-config.json'),
      source: {},
      transport: async () => {
        throw new Error('No network access in fixture settings')
      },
    }),
  })
  return { app, calls, failures, repository, reportRepository, attachments, modelInputs }
}
