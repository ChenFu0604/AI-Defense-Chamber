import type { z } from 'zod'
import type { healthResponseSchema } from './schemas.js'

export interface ApiErrorResponse {
  success: false
  error: { code: string; message: string }
}

export type ApiResponse<T> = { success: true; data: T } | ApiErrorResponse
export type HealthResponse = z.infer<typeof healthResponseSchema>
export type HealthData = HealthResponse['data']
