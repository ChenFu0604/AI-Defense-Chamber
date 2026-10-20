import { randomUUID } from 'node:crypto'
import {
  calculateOverallScore,
  defenseReportSchema,
  reportOutputSchema,
  reportEvidenceIsValid,
  type DefenseReport,
  type DefenseSession,
} from '@defense/shared'
import { AppError } from '../middleware/app-error.js'
import { aiClient, type AIClient } from './ai-client.js'
import { defenseService } from './defense-service.js'
import { createReportRepository, type ReportRepository } from './report-repository.js'
import { buildReportContext, reportSourceFingerprint } from './report-context.js'
import { defenseReportSystemPrompt } from '../prompts/defense-report.js'

export function createReportService(
  sessions: { get(id: string): Promise<DefenseSession> } = defenseService,
  repository: ReportRepository = createReportRepository(),
  client: AIClient = aiClient,
) {
  const pending = new Map<string, Promise<DefenseReport>>()
  function assertEligible(session: DefenseSession) {
    if (session.status !== 'ended')
      throw new AppError(409, 'REPORT_SESSION_NOT_ENDED', '请先结束答辩，再生成诊断报告。')
    if (session.mode !== 'live')
      throw new AppError(
        422,
        'REPORT_DEMO_SESSION',
        '模拟会话仅供流程演示，不生成真实评分；可查看原始问答与逐轮反馈。',
      )
  }
  async function existing(session: DefenseSession) {
    const record = await repository.get(session.id)
    if (
      record &&
      (record.sourceFingerprint !== reportSourceFingerprint(session) ||
        record.projectId !== session.project.id ||
        !reportEvidenceIsValid(record.output, session))
    )
      throw new AppError(
        409,
        'REPORT_SOURCE_MISMATCH',
        '报告与当前会话记录不一致，已保留原文件，请检查数据。',
      )
    return record
  }
  return {
    async get(id: string) {
      const session = await sessions.get(id)
      assertEligible(session)
      const record = await existing(session)
      if (!record) throw new AppError(404, 'REPORT_NOT_FOUND', '尚未生成评分报告，可以点击生成。')
      return record
    },
    generate(id: string): Promise<DefenseReport> {
      const running = pending.get(id)
      if (running) return running
      const work = (async () => {
        const session = await sessions.get(id)
        assertEligible(session)
        const cached = await existing(session)
        if (cached) return cached
        const context = buildReportContext(session)
        const generated = await client.generate({
          name: 'defense_report',
          schema: reportOutputSchema,
          system: defenseReportSystemPrompt,
          user: context.serialized,
        })
        const parsed = reportOutputSchema.safeParse(generated.data)
        if (!parsed.success)
          throw new AppError(
            502,
            'AI_INVALID_OUTPUT',
            '模型评分报告结构或评分范围无效，未保存结果。',
          )
        if (!reportEvidenceIsValid(parsed.data, session))
          throw new AppError(
            502,
            'REPORT_INVALID_EVIDENCE',
            '报告引用不属于真实用户回答，未接受此报告。',
          )
        const record = defenseReportSchema.parse({
          version: 1,
          id: randomUUID(),
          sessionId: id,
          projectId: session.project.id,
          createdAt: new Date().toISOString(),
          mode: 'live',
          model: generated.model,
          sourceFingerprint: reportSourceFingerprint(session),
          answerCount: context.answerCount,
          overallScore: calculateOverallScore(parsed.data.dimensions),
          output: parsed.data,
        })
        await repository.save(record)
        return record
      })().finally(() => pending.delete(id))
      pending.set(id, work)
      return work
    },
  }
}
export type ReportService = ReturnType<typeof createReportService>
