import { vi } from 'vitest'

// Default services imported by tests must never open the real training database
// or scan legacy .data files. SQLite integration tests inject temporary stores.
vi.mock('../apps/server/src/storage/database.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../apps/server/src/storage/database.js')>()
  const workspaceDatabase = original.createWorkspaceDatabase(':memory:')
  return {
    ...original,
    workspaceDatabase,
    createSqliteDefenseRepository: (database = workspaceDatabase) => original.createSqliteDefenseRepository(database),
    createSqliteReportRepository: (database = workspaceDatabase) => original.createSqliteReportRepository(database),
  }
})

// Tests may read their own temporary config files, never the user's saved key.
vi.mock('../apps/server/src/config/model-settings-file.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../apps/server/src/config/model-settings-file.js')>()
  return {
    ...original,
    readSavedModelSettings(path?: string) {
      if (path === undefined || path === original.modelSettingsPath) return null
      return original.readSavedModelSettings(path)
    },
  }
})

vi.mock('../apps/server/src/config/embedding-settings-file.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../apps/server/src/config/embedding-settings-file.js')>()
  return {
    ...original,
    readSavedEmbeddingSettings(path?: string) {
      if (path === undefined || path === original.embeddingSettingsPath) return null
      return original.readSavedEmbeddingSettings(path)
    },
  }
})

// Voice tests use explicitly injected temporary files and transports; never read
// the user's saved ASR/TTS credentials or make incidental paid audio requests.
vi.mock('../apps/server/src/config/voice-settings-file.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../apps/server/src/config/voice-settings-file.js')>()
  return {
    ...original,
    readSavedVoiceSettings(path?: string) {
      if (path === undefined || path === original.voiceSettingsPath) return null
      return original.readSavedVoiceSettings(path)
    },
  }
})

// dotenv is loaded by the app; default RAG calls must not use real environment
// Embedding credentials either. Tests inject config/source or a temporary path.
vi.mock('../apps/server/src/config/embedding.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../apps/server/src/config/embedding.js')>()
  return {
    ...original,
    readEmbeddingConfig(source?: NodeJS.ProcessEnv, savedPath?: string) {
      return original.readEmbeddingConfig(source === undefined && savedPath === undefined ? {} : source, savedPath)
    },
  }
})
