import type { DefenseSession, DefenseQuestion } from '@defense/shared'
import { judgeConfigs } from '../config/judges.js'

export function createDemoDefenseTurn(
  session: DefenseSession,
  judgeId: DefenseQuestion['judgeId'],
  answer: string | null,
) {
  const role = judgeConfigs.find((v) => v.id === judgeId)!
  const quote = answer?.slice(0, 40) ?? ''
  const templates = {
    business: [
      `关于「${quote}」，可以先缩小范围：你最想先帮哪一类人？`,
      `关于「${quote}」，先算一笔最小的投入：你准备先估哪项花费？`,
      `关于「${quote}」，可以先做一次小尝试：你准备找谁确认是否愿意支持？`,
    ],
    technical: [
      `关于「${quote}」，先选一个最小功能：你准备怎样确认它能正常运行？`,
      `关于「${quote}」，可以用两个测试账号试一试：你会怎样检查它们看不到对方的数据？`,
      `关于「${quote}」，假设一次请求失败，你希望用户接下来还能做什么？`,
    ],
    user: [
      `关于「${quote}」，可以找一人试着完成任务：你最想观察哪一步是否顺手？`,
      `关于「${quote}」，先和用户原来的做法比一比：你觉得哪一步最值得简化？`,
      `关于「${quote}」，假设对方第一次使用，你会先改哪处说明让他更容易看懂？`,
    ],
    devil: [
      `关于「${quote}」，换个角度想：出现什么情况，你会改变这个判断？`,
      `关于「${quote}」，先挑最不确定的一点：你能做什么小测试来检查它？`,
      `关于「${quote}」，如果结果不如预期，你会先修改项目的哪一部分？`,
    ],
  }
  const index =
    session.messages.filter((v) => v.sender === 'judge' && v.judgeId === judgeId && v.assessment)
      .length % 3
  const opening: Record<DefenseQuestion['judgeId'], string> = {
    business: '如果先只服务一类人，你会选谁？可以从最常遇到这个麻烦的人想起。',
    technical: '你准备先做出哪个核心功能？可以先选一个最小、能试用的版本。',
    user: '能讲一个用户会用到它的具体时刻吗？从当时遇到的麻烦说起就行。',
    devil: '项目中哪一点你最没把握？可以先挑一句还没验证过的判断。',
  }
  return {
    model: null,
    data: {
      question: {
        judgeId,
        question: answer
          ? '【模拟】' + templates[judgeId][index]
          : `【模拟】关于「${session.project.name}」，${opening[judgeId]}`,
        questionType: answer ? ('evidence' as const) : ('clarification' as const),
        riskLevel: 'medium' as const,
        focus: role.dimensions[0]!,
        rationale: '模拟规则模板，未调用模型，不代表真实分析。',
      },
      assessment: answer
        ? {
            answerQuote: quote,
            evaluation: 'unclear' as const,
            feedback: '模拟演示：仅引用最新回答，展示追问链路，不评判回答质量。',
            nextStrategy: 'probe_evidence' as const,
            risks: [],
          }
        : null,
    },
  }
}
