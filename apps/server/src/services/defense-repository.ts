import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { defenseSessionSchema, type DefenseSession } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'

export interface DefenseRepository {
  get(id: string): Promise<DefenseSession | null>
  save(session: DefenseSession): Promise<void>
}
export function createDefenseRepository(
  directory = fileURLToPath(new URL('../../.data/defense-sessions/', import.meta.url)),
): DefenseRepository {
  function path(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new AppError(400, 'VALIDATION_ERROR', '会话 ID 无效。')
    return join(directory, id + '.json')
  }
  return {
    async get(id) {
      const filename = path(id)
      let content: string
      try {
        content = await readFile(filename, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw new AppError(500, 'SESSION_STORAGE_ERROR', '无法读取会话记录，请检查服务端存储权限。')
      }
      try {
        const record = defenseSessionSchema.parse(JSON.parse(content))
        if (record.id !== id) throw new Error('id mismatch')
        return record
      } catch {
        throw new AppError(
          500,
          'SESSION_STORAGE_CORRUPT',
          '会话文件损坏，已保留原文件，请检查存储。',
        )
      }
    },
    async save(session) {
      const record = defenseSessionSchema.parse(session)
      const filename = path(record.id),
        temporary = filename + '.' + randomUUID() + '.tmp'
      try {
        await mkdir(directory, { recursive: true })
        await writeFile(temporary, JSON.stringify(record), { encoding: 'utf8', flag: 'wx' })
        await rename(temporary, filename)
      } catch {
        throw new AppError(
          500,
          'SESSION_STORAGE_ERROR',
          '会话保存失败，请检查服务端磁盘和权限后重试。',
        )
      } finally {
        await unlink(temporary).catch(() => undefined)
      }
    },
  }
}
