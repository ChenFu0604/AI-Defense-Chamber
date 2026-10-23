import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { DefenseReport, ImprovementTask, ImprovementUpdate } from '@defense/shared'
import { readImprovementTasks, addImprovementTask, updateImprovementTask } from '../services/improvement-storage'

export const useImprovementsStore = defineStore('improvements', () => {
  const tasks = ref<ImprovementTask[]>([]), error = ref('')
  function load() {
    try { tasks.value = readImprovementTasks(); error.value = '' }
    catch (failure) { error.value = failure instanceof Error ? failure.message : '任务读取失败。' }
  }
  function add(report: DefenseReport, index: number, projectName: string) {
    try { tasks.value = addImprovementTask(report, index, projectName); error.value = ''; return true }
    catch (failure) { error.value = failure instanceof Error ? failure.message : '任务保存失败。'; return false }
  }
  function update(base: ImprovementTask, patch: ImprovementUpdate) {
    try { tasks.value = updateImprovementTask(base, patch); error.value = ''; return true }
    catch (failure) { error.value = failure instanceof Error ? failure.message : '任务更新失败。'; return false }
  }
  return {tasks, error, load, add, update}
})
