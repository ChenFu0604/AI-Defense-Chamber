import { createHash } from 'node:crypto'
import { projectInputSchema, type DefenseSession } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'

export const MAX_REPORT_CONTEXT_CHARS = 180000
export function buildReportContext(
  session: DefenseSession,
  materials: { id: string; name: string; text: string; truncated: boolean }[] = [],
) {
  const answers = session.messages.filter(
    (message) => message.sender === 'user' && ['sent', 'failed'].includes(message.status),
  )
  if (!answers.length)
    throw new AppError(422, 'REPORT_EMPTY_SESSION', '尚无已保存的用户回答，无法生成评分报告。')
  const context = {
    materials,
    project: projectInputSchema.parse(session.project),
    profile: {
      coreValue: session.analysis.output.coreValue,
      technicalFeasibility: session.analysis.output.technicalFeasibility,
      businessValue: session.analysis.output.businessValue,
      risks: session.analysis.output.risks.slice(0, 5),
      evidenceGaps: session.analysis.output.evidenceGaps.slice(0, 5),
    },
    answers: answers.map((message) => {
      const question = session.messages.find(
        (item) => item.id === message.replyTo && item.sender === 'judge',
      )
      if (!question)
        throw new AppError(
          422,
          'REPORT_INVALID_HISTORY',
          '回答缺少关联问题，记录已保留，请检查会话数据。',
        )
      return {
        messageId: message.id,
        answer: message.content,
        question: question.content,
        judgeId: question.judgeId,
        answerStatus: message.status,
        attachments: message.attachments?.map((a) => ({
          id: a.id,
          name: a.name,
          mimeType: a.mimeType,
        })),
      }
    }),
    unansweredQuestionCount: session.messages.filter(
      (message) =>
        message.sender === 'judge' && !answers.some((answer) => answer.replyTo === message.id),
    ).length,
    notice:
      '保留全部已提交回答。failed 表示逐轮生成失败，不代表该回答本身无效。画像只是背景，评分引用必须来自用户回答。',
  }
  const serialized = JSON.stringify(context)
  if (serialized.length > MAX_REPORT_CONTEXT_CHARS)
    throw new AppError(
      413,
      'REPORT_CONTEXT_TOO_LARGE',
      '答辩记录超过本次报告的上下文上限，未丢弃回答或生成不完整报告。',
    )
  return { serialized, answerCount: answers.length }
}
export function reportSourceFingerprint(session: DefenseSession) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: session.id,
        project: session.project,
        analysis: session.analysis,
        mode: session.mode,
        endedAt: session.endedAt,
        messages: session.messages,
      }),
    )
    .digest('hex')
}
