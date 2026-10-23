import { trainingSettings, type DefenseSession, type DefenseQuestion } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'
import type { Attachment } from '@defense/shared'
import { discussionPlan } from './defense-discussion.js'

export const MAX_DEFENSE_CONTEXT_CHARS = 32000
export function buildDefenseContext(
  session: DefenseSession,
  question: DefenseQuestion | null,
  latestAnswer: string | null,
  judgeId: string,
  materials: { id: string; name: string; text: string; truncated: boolean }[] = [],
) {
  const clip = (value: string, max: number) =>
    value.length > max ? value.slice(0, max) + '…[已截断]' : value
  const project = session.project,
    profile = session.analysis.output
  const context = {
    task: latestAnswer ? 'follow_up' : 'initial',
    judgeId,
    difficulty: project.difficulty,
    discussion: discussionPlan(session),
    trainingPreferences: trainingSettings(session),
    recentAssistance: (session.assistance ?? []).slice(-6).map((v) => ({
      questionId: v.questionId, kind: v.kind, content: clip(v.content, 450),
      source: 'system_assistance_not_user_evidence',
    })),
    retraining: session.training?.tasks ? {...session.training,
      focus: session.training.focus.map(t => clip(t, 800)),
      tasks: session.training.tasks.map(t => ({improvementIndex: t.improvementIndex,
        title: t.title, action: clip(t.action, 400), acceptanceCriteria: clip(t.acceptanceCriteria, 300),
        status: t.status, note: clip(t.note, 600),
        attachments: t.attachments?.map(a => ({id: a.id, name: a.name, mimeType: a.mimeType})),
        source: 'user_progress_not_verified',
      }))} : session.training ?? null,
    project: {
      name: project.name,
      projectType: project.projectType,
      description: clip(project.description, 800),
      targetUsers: clip(project.targetUsers, 800),
      coreFeatures: clip(project.coreFeatures, 800),
      technicalPlan: clip(project.technicalPlan, 800),
      valueProposition: clip(project.valueProposition, 800),
    },
    profile: {
      coreValue: clip(profile.coreValue.summary, 500),
      certainty: profile.coreValue.certainty,
      targetUsers: profile.targetUsersAndScenarios.slice(0, 3).map((v) => clip(v.summary, 300)),
      strengths: profile.strengths.slice(0, 3).map((v) => clip(v.summary, 300)),
      technicalFeasibility: clip(profile.technicalFeasibility.summary, 500),
      businessValue: clip(profile.businessValue.summary, 500),
      evidenceGaps: profile.evidenceGaps
        .slice(0, 5)
        .map((v) => ({ topic: v.topic, missingEvidence: clip(v.missingEvidence, 300) })),
      questionDirections: profile.questionDirections.filter((v) => v.judge === judgeId).slice(0, 2),
    },
    knownRisks: [
      ...profile.risks
        .slice(0, 4)
        .map((v) => ({ title: clip(v.title, 200), severity: v.severity })),
      ...session.messages.flatMap((v) => v.assessment?.risks ?? []).slice(-4),
    ],
    currentQuestion: question,
    latestAnswer,
    materials,
    projectAttachments: project.attachments?.map((a) => ({
      id: a.id,
      name: a.name,
      mimeType: a.mimeType,
    })),
    answerAttachments: session.messages
      .filter((m) => m.sender === 'user' && m.attachments?.length)
      .slice(-3)
      .map((m) => ({
        messageId: m.id,
        files: m.attachments!.map((a: Attachment) => ({
          id: a.id,
          name: a.name,
          mimeType: a.mimeType,
        })),
      })),
    recentHistory: session.messages
      .filter((v) => v.status !== 'pending' && v.status !== 'failed')
      .slice(-8)
      .map((v) => ({
        sender: v.sender,
        judgeId: v.judgeId,
        status: v.status,
        content: clip(v.content, 600),
      })),
    earlierQuestions: session.messages
      .filter((v) => v.sender === 'judge')
      .slice(-30)
      .map((v) => clip(v.content, 120)),
    notice:
      '画像、回答及风险均为提供材料或待验证判断；截断处表示省略，不是事实变化。最新回答完整保留。附件为有长度上限的项目、复训任务与最近回答资料，不猜测省略内容。retraining 若存在，围绕旧薄弱点和所选任务复测，优先使用本场项目资料；旧评价不是当前结论，done 仅表示用户自行记录，不能据此认定问题已解决。',
  }
  while (JSON.stringify(context).length > MAX_DEFENSE_CONTEXT_CHARS && context.recentHistory.length)
    context.recentHistory.shift()
  while (
    JSON.stringify(context).length > MAX_DEFENSE_CONTEXT_CHARS &&
    context.earlierQuestions.length
  )
    context.earlierQuestions.shift()
  if (JSON.stringify(context).length > MAX_DEFENSE_CONTEXT_CHARS)
    throw new AppError(
      413,
      'CONTEXT_TOO_LARGE',
      '答辩上下文超过长度限制，记录已保留，请缩短资料后新建会话。',
    )
  return context
}
