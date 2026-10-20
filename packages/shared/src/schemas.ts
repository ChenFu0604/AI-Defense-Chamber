import { z } from 'zod'

export const healthResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.literal('ok'),
    service: z.literal('ai-defense-chamber'),
    version: z.string().min(1),
    timestamp: z.iso.datetime(),
    ai: z.enum(['configured', 'not_configured', 'configuration_error']),
  }),
})
