import { computed, reactive, ref } from 'vue'
import {
  projectFieldLabels,
  validateProjectForm,
  type ProjectField,
  type ProjectFieldErrors,
  type ProjectInput,
} from '@defense/shared'
import { useProjectsStore } from '../stores/projects'

export function useProjectForm() {
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
      return await projects.createProject(result.data)
    } catch {
      return null
    }
  }
  return { form, errors, submitted, errorSummary, hasContent, validateField, submit }
}
