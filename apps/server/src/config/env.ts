import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// src/config and dist/config have the same depth relative to the server .env.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true })

const envSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
})

export const env = envSchema.parse(process.env)
