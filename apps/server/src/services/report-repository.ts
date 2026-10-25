import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { defenseReportSchema, type DefenseReport } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'
import { createSqliteReportRepository } from '../storage/database.js'

export interface ReportRepository {
  get(sessionId: string): Promise<DefenseReport | null>
  save(report: DefenseReport): Promise<void>
}
export function createReportRepository(
  directory?: string,
): ReportRepository {
  if (directory === undefined) return createSqliteReportRepository()
  const legacyDirectory = directory
  function path(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new AppError(400, 'VALIDATION_ERROR', '会话 ID 无效。')
    return join(legacyDirectory, id + '.json')
  }
  return {
    async get(sessionId) {
      let raw: string
      try {
        raw = await readFile(path(sessionId), 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        if (error instanceof AppError) throw error
        throw new AppError(500, 'REPORT_STORAGE_ERROR', '无法读取报告，请检查服务端文件权限。')
      }
      try {
        const report = defenseReportSchema.parse(JSON.parse(raw))
        if (report.sessionId !== sessionId) throw new Error('session mismatch')
        return report
      } catch {
        throw new AppError(500, 'REPORT_STORAGE_CORRUPT', '报告文件损坏，原文件已保留，未覆盖。')
      }
    },
    async save(report) {
      const record = defenseReportSchema.parse(report)
      const filename = path(record.sessionId),
        temporary = filename + '.' + randomUUID() + '.tmp'
      try {
        await mkdir(directory, { recursive: true })
        await writeFile(temporary, JSON.stringify(record), {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        })
        await rename(temporary, filename)
      } catch {
        throw new AppError(
          500,
          'REPORT_STORAGE_ERROR',
          '报告保存失败，请检查服务端磁盘与权限后重试。',
        )
      } finally {
        await unlink(temporary).catch(() => undefined)
      }
    },
  }
}
