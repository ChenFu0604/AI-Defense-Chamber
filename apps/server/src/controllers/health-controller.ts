import type { RequestHandler } from 'express'
import type { HealthResponse } from '@defense/shared'
import { getHealth } from '../services/health-service.js'

export const healthController: RequestHandler = (_request, response) => {
  const body: HealthResponse = { success: true, data: getHealth() }
  response.setHeader('Cache-Control', 'no-store')
  response.json(body)
}
