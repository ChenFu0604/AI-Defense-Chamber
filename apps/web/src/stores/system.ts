import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { HealthData } from '@defense/shared'
import { fetchHealth } from '../services/api'

export const useSystemStore = defineStore('system', () => {
  const health = ref<HealthData | null>(null)
  const checking = ref(false)
  const error = ref('')
  async function checkHealth() {
    if (checking.value) return
    checking.value = true
    error.value = ''
    try {
      health.value = await fetchHealth()
    } catch (cause) {
      health.value = null
      error.value = cause instanceof Error ? cause.message : '连接失败，请重试。'
    } finally {
      checking.value = false
    }
  }
  return { health, checking, error, checkHealth }
})
