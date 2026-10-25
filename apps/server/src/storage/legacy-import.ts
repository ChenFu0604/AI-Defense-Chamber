import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { defenseSessionSchema, defenseReportSchema, reportEvidenceIsValid, type DefenseSession, type DefenseReport } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'
import { reportSourceFingerprint } from '../services/report-context.js'

export interface LegacyRecords {
  sessions: DefenseSession[]
  reports: DefenseReport[]
  files: { filename: string; fingerprint: string }[]
}
export async function readLegacyRecords(directory: string): Promise<LegacyRecords> {
  const result: LegacyRecords = { sessions: [], reports: [], files: [] }
  for (const kind of ['defense-sessions', 'defense-reports'] as const) {
    let filenames: string[]
    try { filenames = await readdir(join(directory, kind)) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw new AppError(500, 'WORKSPACE_MIGRATION_FAILED', '无法读取旧训练记录，未迁移或删除原文件。')
    }
    for (const filename of filenames.filter(name => name.endsWith('.json')).sort()) {
      try {
        const raw = await readFile(join(directory, kind, filename), 'utf8')
        const value: unknown = JSON.parse(raw)
        const record = kind === 'defense-sessions' ? defenseSessionSchema.parse(value) : defenseReportSchema.parse(value)
        const id = 'sessionId' in record ? record.sessionId : record.id
        if (filename !== id + '.json') throw new Error('filename mismatch')
        if ('sessionId' in record) result.reports.push(record)
        else result.sessions.push(record)
        result.files.push({ filename: kind + '/' + filename, fingerprint: createHash('sha256').update(raw).digest('hex') })
      } catch {
        throw new AppError(500, 'WORKSPACE_MIGRATION_CORRUPT', `旧记录 ${kind}/${filename} 损坏或标识不匹配；迁移已停止，原文件保持不变。`)
      }
    }
  }
  for (const report of result.reports) {
    const session = result.sessions.find(item => item.id === report.sessionId)
    if (!session || session.status !== 'ended' || session.mode !== 'live' ||
        report.projectId !== session.project.id || report.sourceFingerprint !== reportSourceFingerprint(session) ||
        !reportEvidenceIsValid(report.output, session))
      throw new AppError(500, 'WORKSPACE_MIGRATION_CORRUPT', '旧报告与原会话快照或引用不匹配；迁移已停止，原文件保持不变。')
  }
  return result
}
