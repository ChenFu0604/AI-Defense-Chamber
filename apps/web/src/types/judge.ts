import type { JudgeId } from '@defense/shared'
export interface JudgePreview {
  id: JudgeId
  number: string
  name: string
  english: string
  perspective: string
  question: string
  color: string
  icon: 'business' | 'technology' | 'user' | 'devil'
}
