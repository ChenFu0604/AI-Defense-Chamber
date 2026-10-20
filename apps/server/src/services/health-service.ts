import type { HealthData } from '@defense/shared'
import { getAIConfigurationStatus } from '../config/ai.js'

export function getHealth(): HealthData {
  return {
    status: 'ok',
    service: 'ai-defense-chamber',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    ai: getAIConfigurationStatus(),
  }
}
