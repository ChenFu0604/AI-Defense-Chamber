import { vi } from 'vitest'

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
