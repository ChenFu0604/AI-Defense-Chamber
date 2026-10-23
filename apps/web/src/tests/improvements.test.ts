import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { improvementCollectionSchema, improvementTaskSchema, createImprovementTask } from '@defense/shared'
import { MemoryStorage } from './project-fixtures'
import { reportFixture } from '../../../../tests/fixtures/report'
import { IMPROVEMENT_STORAGE_KEY, addImprovementTask, readImprovementTasks, updateImprovementTask } from '../services/improvement-storage'
import { useImprovementsStore } from '../stores/improvements'

let storage: MemoryStorage
beforeEach(() => { storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage); setActivePinia(createPinia()) })
afterEach(() => vi.unstubAllGlobals())
const add = () => addImprovementTask(reportFixture(), 0, '训练项目', storage)
describe('saved project improvement tasks', () => {
  it('copies actual report suggestions, links their sources and deduplicates after a reload', () => {
    const original = reportFixture(), tasks = add()
    const task = tasks[0]!
    expect(task.action).toBe(original.output.improvements[0]!.action)
    expect(task.references).toEqual(original.output.improvements[0]!.references)
    expect(task.sourceReportId).toBe(original.id)
    expect(task.status).toBe('todo')
    expect(readImprovementTasks(storage)).toEqual(tasks)
    expect(add()).toEqual(tasks)
    expect(() => addImprovementTask(original, 7, '训练项目', storage)).toThrow('没有这项')
    expect(original).toEqual(reportFixture())
  })
  it('persists progress without changing immutable suggestions or the original report', () => {
    const task = add()[0]!
    const updated = updateImprovementTask(task, {status: 'done', note: '已补充访谈记录', attachments: []}, storage)[0]!
    expect(updated.status).toBe('done')
    expect(updated.action).toBe(task.action)
    expect(updated.updatedAt > task.updatedAt).toBe(true)
    expect(readImprovementTasks(storage)[0]).toEqual(updated)
    expect(reportFixture().output.improvements[0]!.action).toBe(task.action)
  })
  it('does not overwrite corrupt, incomplete, duplicate or unsupported version records', () => {
    const task = add()[0]!
    for (const raw of ['{broken', JSON.stringify({version: 2, tasks: [task]}), JSON.stringify({version: 1, tasks: [{id: task.id}]}), JSON.stringify({version: 1, tasks: [task, task]})]) {
      storage.data.set(IMPROVEMENT_STORAGE_KEY, raw)
      expect(() => add()).toThrow('数据损坏')
      expect(storage.data.get(IMPROVEMENT_STORAGE_KEY)).toBe(raw)
    }
    expect(improvementTaskSchema.safeParse({...task, status: 'verified'}).success).toBe(false)
    expect(improvementCollectionSchema.safeParse({version: 1, tasks: [task, {...task, id: crypto.randomUUID()}]}).success).toBe(false)
  })
  it('surfaces write/read-back failures and keeps the store state unchanged', () => {
    const store = useImprovementsStore()
    storage.dropWrites = true
    expect(store.add(reportFixture(), 0, '训练项目')).toBe(false)
    expect(store.error).toContain('无法确认')
    expect(store.tasks).toEqual([])
    storage.dropWrites = false; storage.denyWrites = true
    expect(() => add()).toThrow('无法确认')
  })
  it('rejects stale edits but safely confirms an already-applied unconfirmed write', () => {
    const original = add()[0]!
    updateImprovementTask(original, {status: 'in_progress', note: '另一页面更新'}, storage)
    expect(() => updateImprovementTask(original, {status: 'done', note: '旧页面编辑'}, storage)).toThrow('其他页面')
    expect(updateImprovementTask(original, {status: 'in_progress', note: '另一页面更新'}, storage)[0]!.note).toBe('另一页面更新')
  })
  it('retains saved data at the capacity limit and validates task fields', () => {
    const report = reportFixture(), item = report.output.improvements[0]!
    const tasks = Array.from({length: 299}, () => createImprovementTask({...report, id: crypto.randomUUID()}, 0, '项目', crypto.randomUUID(), new Date().toISOString()))
      .map(t => ({...t, note: '录'.repeat(2000)}))
    storage.data.set(IMPROVEMENT_STORAGE_KEY, JSON.stringify({version: 1, tasks}))
    const raw = storage.data.get(IMPROVEMENT_STORAGE_KEY)
    expect(() => add()).toThrow('1 MiB')
    expect(storage.data.get(IMPROVEMENT_STORAGE_KEY)).toBe(raw)
    expect(improvementTaskSchema.safeParse({...tasks[0], acceptanceCriteria: ''}).success).toBe(false)
    expect(item.acceptanceCriteria).toBeTruthy()
  })
})
