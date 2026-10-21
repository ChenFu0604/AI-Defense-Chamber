import { judgeDefinitions } from '@defense/shared'
import type { JudgePreview } from '../types/judge'

// Homepage editorial examples; runtime system prompts remain server-side.
const previews: JudgePreview[] = [
  {
    id: 'business',
    number: '01',
    name: '商业评委',
    english: 'THE STRATEGIST',
    perspective: '需求是否真实，价值能否持续。',
    question: '先想一类最需要它的人：你准备找谁聊聊？',
    color: 'mint',
    icon: 'business',
  },
  {
    id: 'technical',
    number: '02',
    name: '技术评委',
    english: 'THE ARCHITECT',
    perspective: '穿透技术名词，追问实现细节。',
    question: '先做一个能试用的小版本，你会选哪个功能？',
    color: 'cyan',
    icon: 'technology',
  },
  {
    id: 'user',
    number: '03',
    name: '用户评委',
    english: 'THE ADVOCATE',
    perspective: '回到真实场景，看见用户的选择。',
    question: '第一次用可能哪里卡住？你最想先改哪一步？',
    color: 'violet',
    icon: 'user',
  },
  {
    id: 'devil',
    number: '04',
    name: '魔鬼评委',
    english: 'THE CHALLENGER',
    perspective: '挑战每一个未经验证的假设。',
    question: '哪一点你还没把握？想一个小测试检查它。',
    color: 'rose',
    icon: 'devil',
  },
]

export const judges: JudgePreview[] = previews.map((preview) => {
  const role = judgeDefinitions.find((item) => item.id === preview.id)!
  return {
    ...preview,
    name: role.name,
    perspective: role.introduction,
    color: role.color,
    icon: role.icon,
  }
})
