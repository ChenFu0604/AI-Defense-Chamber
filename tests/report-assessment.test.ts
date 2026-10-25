import { describe, expect, it } from 'vitest'
import {
  calculateOverallScore,
  compareHistoryReports,
  defenseReportSchema,
  dimensionEvaluationSchema,
  getDimensionAssessment,
  getReportCoverage,
  reportDimensionIds,
  reportEvidenceIsValid,
  reportOutputSchema,
} from '@defense/shared'
import { endedReportSession, legacyReportFixture, reportFixture } from './fixtures/report.js'

function partialReport() {
  const report = reportFixture()
  report.output.dimensions.technical = {
    status: 'insufficient', score: null, reason: '本轮没有讨论技术方案，需要进一步提问。', references: [],
  }
  report.overallScore = null
  return report
}
function nextReport() {
  return { ...reportFixture(), id: crypto.randomUUID(), sessionId: crypto.randomUUID() }
}

describe('explicit report observation coverage', () => {
  it('keeps a real zero score assessed and uses all five equal weights', () => {
    const report = reportFixture()
    report.output.dimensions.logic.score = 0
    report.overallScore = calculateOverallScore(report.output.dimensions)
    expect(report.overallScore).toBe(48.2)
    expect(getReportCoverage(defenseReportSchema.parse(report))).toEqual({ assessed: 5, total: 5, insufficient: [], legacy: false })
  })
  it('accepts missing observations without fabricating references, a zero score or a partial average', () => {
    const report = defenseReportSchema.parse(partialReport())
    expect(report.overallScore).toBeNull()
    expect(calculateOverallScore(report.output.dimensions)).toBeNull()
    expect(getReportCoverage(report)).toEqual({ assessed: 4, total: 5, insufficient: ['technical'], legacy: false })
    expect(reportEvidenceIsValid(report.output, endedReportSession())).toBe(true)
  })
  it('accepts all five observations as insufficient without a divide-by-zero result', () => {
    const report = reportFixture()
    for (const id of reportDimensionIds) report.output.dimensions[id] = {
      status: 'insufficient', score: null, reason: '回答没有提供足够的相关内容，建议继续讨论。', references: [],
    }
    report.overallScore = null
    expect(defenseReportSchema.safeParse(report).success).toBe(true)
    expect(calculateOverallScore(report.output.dimensions)).toBeNull()
    expect(getReportCoverage(report).assessed).toBe(0)
  })
  it.each([
    { status: 'insufficient', score: 0, references: [] },
    { status: 'insufficient', score: 60, references: [] },
    { status: 'assessed', score: null, references: [] },
    { status: 'assessed', score: 60, references: [] },
    { status: 'unknown', score: null, references: [] },
    { score: 60, references: [] },
  ])('rejects inconsistent status/score/reference combinations: %j', (input) => {
    expect(dimensionEvaluationSchema.safeParse({ ...input, reason: '结构校验测试' }).success).toBe(false)
  })
  it('requires a reason and every dimension even when observations are insufficient', () => {
    const output = partialReport().output
    expect(reportOutputSchema.safeParse({ ...output, dimensions: { ...output.dimensions, technical: { ...output.dimensions.technical, reason: '' } } }).success).toBe(false)
    expect(reportOutputSchema.safeParse({ ...output, dimensions: { logic: output.dimensions.logic } }).success).toBe(false)
  })
  it('still validates supplied references on an insufficient dimension', () => {
    const report = partialReport()
    report.output.dimensions.technical.references = [{ messageId: crypto.randomUUID(), quote: '不存在的原文' }]
    expect(reportEvidenceIsValid(report.output, endedReportSession())).toBe(false)
  })
  it('rejects fake totals for partial reports and missing totals for fully scored reports', () => {
    expect(defenseReportSchema.safeParse({ ...partialReport(), overallScore: 0 }).success).toBe(false)
    expect(defenseReportSchema.safeParse({ ...partialReport(), overallScore: 62.4 }).success).toBe(false)
    expect(defenseReportSchema.safeParse({ ...reportFixture(), overallScore: null }).success).toBe(false)
  })
  it('reads legacy scores unchanged without inferring assessed coverage from old reason text', () => {
    const legacy = legacyReportFixture()
    legacy.output.dimensions.logic.reason = '观察不足，分数仅为有限样本下的初步估计。'
    const result = defenseReportSchema.parse(legacy)
    expect(result).toEqual(legacy)
    expect(result.overallScore).toBe(62.4)
    expect(getDimensionAssessment(result.output.dimensions.logic)).toBe('legacy')
    expect(getReportCoverage(result)).toEqual({ assessed: 0, total: 5, insufficient: [], legacy: true })
    expect(calculateOverallScore(result.output.dimensions)).toBe(62.4)
  })
  it('does not accept legacy data as a new report or mixed version dimension data', () => {
    const legacy = legacyReportFixture()
    expect(defenseReportSchema.safeParse({ ...legacy, version: 2 }).success).toBe(false)
    expect(defenseReportSchema.safeParse({ ...reportFixture(), version: 1 }).success).toBe(false)
    expect(defenseReportSchema.safeParse({ ...legacy, version: 3 }).success).toBe(false)
  })
})

describe('score comparison with observation coverage', () => {
  it('compares only mutually assessed dimensions and suppresses the partial overall delta', () => {
    const before = partialReport(), after = nextReport()
    after.output.dimensions.logic.score = 80
    after.overallScore = calculateOverallScore(after.output.dimensions)
    const result = compareHistoryReports(before, after)
    expect(result.overall).toBeNull()
    expect(result.overallStatus).toBe('insufficient')
    expect(result.dimensions.find(d => d.id === 'logic')).toMatchObject({ before: 71, after: 80, delta: 9, comparisonStatus: 'comparable' })
    expect(result.dimensions.find(d => d.id === 'technical')).toMatchObject({ before: null, after: 64, delta: null, beforeStatus: 'insufficient', afterStatus: 'assessed', comparisonStatus: 'insufficient' })
  })
  it('keeps unchanged and zero scores comparable without using truthiness', () => {
    const before = reportFixture(), after = nextReport()
    before.output.dimensions.logic.score = 0
    after.output.dimensions.logic.score = 0
    before.overallScore = calculateOverallScore(before.output.dimensions)
    after.overallScore = calculateOverallScore(after.output.dimensions)
    expect(compareHistoryReports(before, after).dimensions[0]).toMatchObject({ before: 0, after: 0, delta: 0, comparisonStatus: 'comparable' })
    expect(compareHistoryReports(before, after).overall).toBe(0)
  })
  it('preserves legacy-to-legacy deltas while refusing unknown-coverage to assessed deltas', () => {
    const before = legacyReportFixture(), after = { ...legacyReportFixture(), sessionId: crypto.randomUUID() }
    after.output.dimensions.logic.score += 5
    after.overallScore = calculateOverallScore(after.output.dimensions)!
    expect(compareHistoryReports(before, after)).toMatchObject({ overall: 1, overallStatus: 'comparable' })
    const mixed = compareHistoryReports(before, nextReport())
    expect(mixed).toMatchObject({ overall: null, overallStatus: 'legacy_mismatch' })
    expect(mixed.dimensions.every(d => d.delta === null && d.comparisonStatus === 'legacy_mismatch')).toBe(true)
  })
})
