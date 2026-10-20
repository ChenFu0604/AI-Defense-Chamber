import { describe, expect, it } from 'vitest'
import {
  createProjectRecord,
  defenseDifficulties,
  projectInputSchema,
  projectSchema,
  projectTextLimits,
  projectTypes,
  validateProjectForm,
} from '@defense/shared'
import { fixtureProject, validInput } from './project-fixtures'

describe('project input and form validation', () => {
  it('trims text consistently before creating a project', () => {
    const result = validateProjectForm({
      ...validInput,
      name: '  校园节能助手  ',
      description: ' 项目说明 \n ',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('校园节能助手')
      expect(result.data.description).toBe('项目说明')
      expect(result.errors).toEqual({})
    }
  })
  it('reports every empty text field using its field name', () => {
    const result = validateProjectForm({
      ...validInput,
      name: ' ',
      description: '\n',
      targetUsers: '',
      coreFeatures: '',
      technicalPlan: '',
      valueProposition: '',
    })
    expect(result.success).toBe(false)
    expect(Object.keys(result.errors).sort()).toEqual([
      'coreFeatures',
      'description',
      'name',
      'targetUsers',
      'technicalPlan',
      'valueProposition',
    ])
    expect(result.errors.name).toBe('请填写项目名称。')
    expect(result.errors.valueProposition).toBe('请填写商业模式或应用价值。')
  })
  it.each(Object.entries(projectTextLimits))('rejects an overlong %s', (field, limit) => {
    const result = validateProjectForm({ ...validInput, [field]: '字'.repeat(limit + 1) })
    expect(result.success).toBe(false)
    expect(result.errors).toHaveProperty(field)
  })
  it.each(projectTypes)('accepts project type %s', (projectType) => {
    expect(projectInputSchema.safeParse({ ...validInput, projectType }).success).toBe(true)
  })
  it.each(defenseDifficulties)('accepts difficulty %s', (difficulty) => {
    expect(projectInputSchema.safeParse({ ...validInput, difficulty }).success).toBe(true)
  })
  it('rejects unknown types and difficulties with field-specific errors', () => {
    const result = validateProjectForm({
      ...validInput,
      projectType: 'invalid',
      difficulty: 'impossible',
    })
    expect(result.success).toBe(false)
    expect(result.errors.projectType).toBe('请选择有效的项目类型。')
    expect(result.errors.difficulty).toBe('请选择有效的答辩难度。')
  })
  it('rejects missing fields and incorrect data types', () => {
    expect(projectInputSchema.safeParse({ name: 123 }).success).toBe(false)
    expect(validateProjectForm(undefined).success).toBe(false)
  })
  it('creates validated metadata without mutating the input', () => {
    const record = createProjectRecord(
      validInput,
      '22222222-2222-4222-8222-222222222222',
      '2026-10-20T02:00:00.000Z',
    )
    expect(record).toMatchObject(validInput)
    expect(record.updatedAt).toBe(record.createdAt)
    expect(validInput).not.toHaveProperty('id')
  })
  it('rejects invalid identities and timestamps', () => {
    expect(projectSchema.safeParse(fixtureProject({ id: 'bad' })).success).toBe(false)
    expect(projectSchema.safeParse(fixtureProject({ createdAt: 'not-a-date' })).success).toBe(false)
    expect(
      projectSchema.safeParse(fixtureProject({ updatedAt: '2025-10-20T01:00:00.000Z' })).success,
    ).toBe(false)
  })
})
