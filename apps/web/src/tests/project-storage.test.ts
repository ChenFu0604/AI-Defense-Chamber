import { describe, expect, it } from 'vitest'
import { PROJECT_STORAGE_KEY, readProjects, writeProjects } from '../services/project-storage'
import { fixtureProject, MemoryStorage } from './project-fixtures'

describe('versioned local project storage', () => {
  it('treats a missing key as a new workspace', () => {
    expect(readProjects(new MemoryStorage())).toEqual([])
  })
  it('round-trips all fields and sorts newest first', () => {
    const storage = new MemoryStorage()
    const older = fixtureProject()
    const newer = fixtureProject({
      id: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-10-21T01:00:00.000Z',
      updatedAt: '2026-10-21T01:00:00.000Z',
    })
    writeProjects([older, newer], storage)
    expect(readProjects(storage)).toEqual([newer, older])
    expect(JSON.parse(storage.getItem(PROJECT_STORAGE_KEY)!)).toMatchObject({ version: 1 })
  })
  it.each([
    '{invalid',
    'null',
    '[]',
    JSON.stringify({ version: 2, projects: [] }),
    JSON.stringify({ version: 1, projects: [{ name: 'incomplete' }] }),
  ])('rejects malformed data without overwriting it', (raw) => {
    const storage = new MemoryStorage()
    storage.data.set(PROJECT_STORAGE_KEY, raw)
    expect(() => readProjects(storage)).toThrow(/损坏|不兼容/)
    expect(storage.data.get(PROJECT_STORAGE_KEY)).toBe(raw)
  })
  it('rejects duplicate IDs in saved data', () => {
    const storage = new MemoryStorage()
    storage.data.set(
      PROJECT_STORAGE_KEY,
      JSON.stringify({ version: 1, projects: [fixtureProject(), fixtureProject()] }),
    )
    expect(() => readProjects(storage)).toThrow(/损坏|不兼容/)
  })
  it('reports permission failures while reading', () => {
    const storage = new MemoryStorage()
    storage.denyReads = true
    expect(() => readProjects(storage)).toThrow('读取本地项目失败')
  })
  it('reports quota failures while saving', () => {
    const storage = new MemoryStorage()
    storage.denyWrites = true
    expect(() => writeProjects([fixtureProject()], storage)).toThrow('项目保存失败')
    expect(storage.data.size).toBe(0)
  })
  it('does not report success when the write is silently dropped', () => {
    const storage = new MemoryStorage()
    storage.dropWrites = true
    expect(() => writeProjects([fixtureProject()], storage)).toThrow('无法确认项目已保存')
  })
  it('does not replace saved content with invalid data', () => {
    const storage = new MemoryStorage()
    writeProjects([fixtureProject()], storage)
    const previous = storage.getItem(PROJECT_STORAGE_KEY)
    expect(() => writeProjects([fixtureProject({ name: '' })], storage)).toThrow()
    expect(storage.getItem(PROJECT_STORAGE_KEY)).toBe(previous)
  })
})
