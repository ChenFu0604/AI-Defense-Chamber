import type { JudgePreview } from '../types/judge'

// Editorial previews only. Runtime judge prompts belong to the backend in a later phase.
export const judges: JudgePreview[] = [
  {
    id: 'business',
    number: '01',
    name: '商业评委',
    english: 'THE STRATEGIST',
    perspective: '需求是否真实，价值能否持续。',
    question: '如果用户不愿付费，你的商业逻辑还成立吗？',
    color: 'mint',
    icon: 'business',
  },
  {
    id: 'technology',
    number: '02',
    name: '技术评委',
    english: 'THE ARCHITECT',
    perspective: '穿透技术名词，追问实现细节。',
    question: '当并发量增长十倍，最先失效的是哪一环？',
    color: 'cyan',
    icon: 'technology',
  },
  {
    id: 'user',
    number: '03',
    name: '用户评委',
    english: 'THE ADVOCATE',
    perspective: '回到真实场景，看见用户的选择。',
    question: '用户为什么要改变习惯，开始使用你的产品？',
    color: 'violet',
    icon: 'user',
  },
  {
    id: 'devil',
    number: '04',
    name: '魔鬼评委',
    english: 'THE CHALLENGER',
    perspective: '挑战每一个未经验证的假设。',
    question: '你最有信心的结论，有什么证据可以证明？',
    color: 'rose',
    icon: 'devil',
  },
]
