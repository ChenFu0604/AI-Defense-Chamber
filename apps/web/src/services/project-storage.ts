import { projectCollectionSchema, type Project } from '@defense/shared'

export const PROJECT_STORAGE_KEY = 'defense-chamber.projects.v1'
export interface ProjectStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class ProjectStorageError extends Error {
  constructor(
    public readonly kind: 'unavailable' | 'invalid' | 'write' | 'unconfirmed',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectStorageError'
  }
}

export function getProjectStorage(): ProjectStorage {
  try {
    if (!globalThis.localStorage) throw new Error('Unavailable')
    return globalThis.localStorage
  } catch {
    throw new ProjectStorageError(
      'unavailable',
      '无法访问浏览器本地存储，请检查浏览器权限或隐私设置后重试。',
    )
  }
}

export function readProjects(storage: ProjectStorage = getProjectStorage()): Project[] {
  let raw: string | null
  try {
    raw = storage.getItem(PROJECT_STORAGE_KEY)
  } catch {
    throw new ProjectStorageError('unavailable', '读取本地项目失败，请检查浏览器存储权限后重试。')
  }
  if (raw === null) return []
  try {
    const collection = projectCollectionSchema.parse(JSON.parse(raw))
    return collection.projects.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  } catch {
    throw new ProjectStorageError(
      'invalid',
      '本地项目记录损坏或版本不兼容。已有内容未被覆盖，请先备份或恢复该浏览器的项目记录。',
    )
  }
}

export function writeProjects(
  projects: Project[],
  storage: ProjectStorage = getProjectStorage(),
): void {
  const payload = JSON.stringify(projectCollectionSchema.parse({ version: 1, projects }))
  try {
    storage.setItem(PROJECT_STORAGE_KEY, payload)
  } catch {
    throw new ProjectStorageError(
      'write',
      '项目保存失败，可能是存储空间不足或浏览器禁止写入。填写内容已保留，请检查后重试。',
    )
  }
  try {
    if (storage.getItem(PROJECT_STORAGE_KEY) !== payload) throw new Error('Read-back mismatch')
  } catch {
    throw new ProjectStorageError(
      'unconfirmed',
      '无法确认项目已保存。填写内容已保留，请检查本地存储后重试。',
    )
  }
}
