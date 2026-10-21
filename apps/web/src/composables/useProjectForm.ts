import { computed, getCurrentScope, onScopeDispose, reactive, ref, watch } from 'vue'
import {
  projectFieldLabels,
  validateProjectForm,
  projectInputSchema,
  projectSchema,
  type ProjectField,
  type ProjectFieldErrors,
  type ProjectInput,
  type Project,
  type ProjectDraft,
} from '@defense/shared'
import { useProjectsStore } from '../stores/projects'
import { readProjectDrafts, removeProjectDraft, saveProjectDraft } from '../services/project-drafts'

export function useProjectForm(options: { drafts?: boolean; project?: Project } = {}) {
  const projects = useProjectsStore()
  const form = reactive<ProjectInput>({
    name: '',
    description: '',
    projectType: 'innovation',
    targetUsers: '',
    coreFeatures: '',
    technicalPlan: '',
    valueProposition: '',
    difficulty: 'normal',
  })
  const errors = ref<ProjectFieldErrors>({})
  const baseProject = ref(options.project ? projectSchema.parse(options.project) : null)
  const draftKey = options.project ? `edit:${options.project.id}` : 'new'
  const draftError = ref(''), draftSavedAt = ref(''), restored = ref(false), draftPending = ref(false)
  let finished = false, writable = true, timer: ReturnType<typeof setTimeout> | undefined
  let pendingDraft: ProjectDraft | null = null
  if (options.project) Object.assign(form, projectInputSchema.parse(options.project))
  if (options.drafts) {
    try {
      const saved = readProjectDrafts().find((d) => d.key === draftKey)
      if (saved) {
        Object.assign(form, saved.input)
        baseProject.value = saved.baseProject
        draftSavedAt.value = saved.updatedAt
        restored.value = true
      }
    } catch (failure) {
      writable = false
      draftError.value = failure instanceof Error ? failure.message : '草稿读取失败。'
    }
  }
  const submitted = ref(false)
  const errorSummary = computed(() =>
    Object.entries(errors.value).map(([field, message]) => ({
      field,
      label: projectFieldLabels[field as ProjectField],
      message,
    })),
  )
  const hasContent = computed(
    () =>
      [
        form.name,
        form.description,
        form.targetUsers,
        form.coreFeatures,
        form.technicalPlan,
        form.valueProposition,
      ].some((value) => value.trim().length > 0) || !!form.attachments?.length,
  )
  function saveDraft() {
    clearTimeout(timer)
    if (!options.drafts || finished) return
    try {
      const current = readProjectDrafts().find((d) => d.key === draftKey)
      if (current && pendingDraft && JSON.stringify(current) === JSON.stringify(pendingDraft))
        draftSavedAt.value = current.updatedAt
      if (!writable || (current?.updatedAt ?? '') !== draftSavedAt.value)
        throw new Error('草稿已损坏或在其他页面更新，未覆盖原数据。输入仍在本页，请先备份并核对。')
      if (!hasContent.value && !current) return
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(draftSavedAt.value || '1970-01-01') + 1)).toISOString()
      pendingDraft = { key: draftKey, input: { ...form }, baseProject: baseProject.value, updatedAt }
      saveProjectDraft(pendingDraft)
      draftSavedAt.value = updatedAt
      draftError.value = ''
      draftPending.value = false
      pendingDraft = null
    } catch (failure) {
      draftError.value = failure instanceof Error ? failure.message : '草稿保存失败。'
    }
  }
  if (options.drafts) {
    watch(form, () => {
      if (finished) return
      draftPending.value = true
      clearTimeout(timer)
      timer = setTimeout(saveDraft, 500)
    }, { deep: true, flush: 'sync' })
    if (getCurrentScope()) onScopeDispose(() => {
      clearTimeout(timer)
      if (draftPending.value) saveDraft()
    })
  }
  function validateField(field: ProjectField) {
    const result = validateProjectForm(form)
    const error = result.errors[field]
    if (error) errors.value[field] = error
    else delete errors.value[field]
  }
  async function submit() {
    if (projects.saving) return null
    submitted.value = true
    const result = validateProjectForm(form)
    errors.value = result.errors
    projects.saveError = ''
    if (!result.success) return null
    try {
      const project = baseProject.value
        ? await projects.updateProject(baseProject.value, result.data)
        : await projects.createProject(result.data)
      finished = true
      clearTimeout(timer)
      draftPending.value = false
      if (options.drafts) {
        try {
          const current = readProjectDrafts().find((d) => d.key === draftKey)
          if (current?.updatedAt === draftSavedAt.value) removeProjectDraft(draftKey)
        } catch {
          projects.historyWarning = '项目已保存，但旧草稿未能清理；下次打开时请核对，避免重复建档。'
        }
      }
      return project
    } catch {
      return null
    }
  }
  return { form, errors, submitted, errorSummary, hasContent, validateField, submit,
    draftError, draftSavedAt, restored, draftPending, saveDraft }
}
