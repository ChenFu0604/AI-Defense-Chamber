import type { Project, ProjectInput } from '@defense/shared'
import type { ProjectStorage } from '../services/project-storage'

export const validInput: ProjectInput = {
  name: '校园节能助手',
  description: '帮助在校学生发现并改善宿舍能源浪费的项目，目前处于原型阶段。',
  projectType: 'research',
  targetUsers: '住校学生与后勤管理人员',
  coreFeatures: '能耗可视化、节能建议与反馈记录',
  technicalPlan: 'Vue 前端与 Node.js API，数据采集方案待验证。',
  valueProposition: '通过访谈和小范围试点验证节能价值，暂无真实效果数据。',
  difficulty: 'advanced',
}
export function fixtureProject(overrides: Partial<Project> = {}): Project {
  return {
    ...validInput,
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-10-20T01:00:00.000Z',
    updatedAt: '2026-10-20T01:00:00.000Z',
    ...overrides,
  }
}
export class MemoryStorage implements ProjectStorage {
  data = new Map<string, string>()
  denyReads = false
  denyWrites = false
  dropWrites = false
  failNextReadAfterWrite = false
  getItem(key: string) {
    if (this.denyReads) throw new Error('Storage denied')
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.denyWrites) throw new Error('Quota exceeded')
    if (!this.dropWrites) this.data.set(key, value)
    if (this.failNextReadAfterWrite) {
      this.failNextReadAfterWrite = false
      this.denyReads = true
    }
  }
}
