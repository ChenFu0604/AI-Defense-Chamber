import { createHash } from 'node:crypto'
import type { CreateDefenseRequest, DefenseSession } from '@defense/shared'
import { analysisFixture, analysisProject } from './analysis.js'
export function defenseInput(mode: 'live' | 'demo' = 'live'): CreateDefenseRequest {
  return {
    requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    project: analysisProject,
    analysis: analysisFixture(mode),
    mode,
    judgeId: 'business',
  }
}
export function defenseFixture(mode: 'live' | 'demo' = 'live'): DefenseSession {
  const input = defenseInput(mode),
    now = '2026-10-20T10:00:00.000Z'
  return {
    id: input.requestId,
    project: input.project,
    analysis: input.analysis,
    mode,
    currentJudgeId: 'business',
    currentQuestionId: null,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    endedAt: null,
    messages: [],
    pending: null,
    completed: [],
    createFingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    error: null,
  }
}
