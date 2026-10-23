<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import {
  ArrowUpRight,
  Check,
  FileText,
  FileUp,
  ChevronDown,
  ShieldCheck,
  LoaderCircle,
} from 'lucide-vue-next'
import {
  defenseDifficulties,
  difficultyDescriptions,
  difficultyLabels,
  projectTypes,
  projectTypeLabels,
  projectTextLimits,
  projectFieldLabels,
  MAX_ATTACHMENTS,
  type Project,
  type ProjectField,
} from '@defense/shared'
import AppButton from './ui/AppButton.vue'
import FormField from './ui/FormField.vue'
import { useProjectForm } from '../composables/useProjectForm'
import { useProjectsStore } from '../stores/projects'
import { exampleProject, projectTextFields } from '../data/project-form'
import AttachmentUploader from './attachments/AttachmentUploader.vue'
const uploading = ref(false),
  materialsOpen = ref(false),
  attachmentPicker = ref<InstanceType<typeof AttachmentUploader> | null>(null),
  importText = ref(''),
  importField = ref<(typeof projectTextFields)[number]['key']>('description'),
  importError = ref('')

const props = defineProps<{ project?: Project }>()
const emit = defineEmits<{ created: [project: Project] }>()
const { form, errors, errorSummary, hasContent, validateField, submit,
  draftError, draftSavedAt, draftPending, restored, saveDraft } = useProjectForm({ drafts: true, project: props.project })
const expanded = ref(!!props.project || !!form.coreFeatures || !!form.technicalPlan || !!form.valueProposition)
const fieldGroups = computed(() => [
  { id: 'project-form-idea', number: '02', title: '说明想法与使用场景', fields: projectTextFields.slice(0, 2) },
  ...(expanded.value ? [{ id: 'project-form-plan', number: '03', title: '补充方案与项目价值', fields: projectTextFields.slice(2) }] : []),
])
function protectUnload(event: BeforeUnloadEvent) {
  if (draftPending.value) saveDraft()
  if (draftError.value && hasContent.value && !savedProject.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', protectUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', protectUnload))
onBeforeRouteLeave(() => {
  if (savedProject.value) return true
  if (draftPending.value) saveDraft()
  if (draftError.value && hasContent.value) return window.confirm('草稿尚未确认保存，离开会丢失本页输入。仍要离开吗？')
  return true
})
const projects = useProjectsStore()
const confirmExample = ref(false)
const savedProject = ref<Project | null>(null)
const formElement = ref<HTMLFormElement | null>(null)
const navigationNote = '项目已保存到此浏览器，可通过下方链接查看。'

function applyExample() {
  Object.assign(form, exampleProject)
  errors.value = {}
  projects.saveError = ''
  confirmExample.value = false
  expanded.value = true
}
function loadExample() {
  if (hasContent.value) confirmExample.value = true
  else applyExample()
}
async function focusField(field: string) {
  await nextTick()
  const control = formElement.value?.querySelector<HTMLElement>(`#project-${field}`)
  control?.focus()
  control?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
function onInput(field: ProjectField) {
  if (errors.value[field]) validateField(field)
  projects.saveError = ''
}
async function save() {
  if (savedProject.value || projects.saving || uploading.value) return
  expanded.value = true
  const project = await submit()
  if (!project) {
    const firstError = Object.keys(errors.value)[0]
    if (firstError) await focusField(firstError)
    return
  }
  savedProject.value = project
  emit('created', project)
}
function appendImport() {
  const existing = form[importField.value],
    text = importText.value.trim()
  const next = existing ? existing + '\n\n' + text : text
  if (!text) {
    importError.value = '请先选择并检查要导入的文字。'
    return
  }
  if (next.length > projectTextLimits[importField.value]) {
    importError.value = `追加后超过本字段 ${projectTextLimits[importField.value]} 字上限，请在预览中删减；原填写内容未改变。`
    return
  }
  form[importField.value] = next
  if (['coreFeatures', 'technicalPlan', 'valueProposition'].includes(importField.value)) expanded.value = true
  importError.value = ''
  importText.value = ''
  onInput(importField.value)
}
function selectDocument(text: string) {
  importText.value = text
  importError.value = ''
}
function importDocument() {
  if (projects.saving || savedProject.value || uploading.value) return
  materialsOpen.value = true
  attachmentPicker.value?.chooseDocuments()
}
</script>
<template>
  <form
    ref="formElement"
    class="project-form surface-panel"
    novalidate
    :aria-busy="projects.saving"
    @submit.prevent="save"
  >

    <div class="form-panel-heading">
      <div>
        <h2>{{ project ? '修改项目，保留每次进步。' : '先从一个想法开始。' }}</h2>
        <p>先写名称、简介和目标用户，草稿会自动保存。准备分析前，再补齐核心功能、技术方案与应用价值。</p>
      </div>
      <div class="project-form-heading-actions">
        <AppButton
          variant="secondary"
          :busy="uploading"
          :disabled="
            projects.saving || !!savedProject || (form.attachments?.length ?? 0) >= MAX_ATTACHMENTS
          "
          @click="importDocument"
          ><FileUp :size="15" />{{ uploading ? '正在处理材料…' : '导入项目文档' }}</AppButton
        >
        <AppButton
          variant="secondary"
          :disabled="projects.saving || !!savedProject || uploading"
          @click="loadExample"
          ><FileText :size="14" />载入示例</AppButton
        >
      </div>
    </div>
    <div class="draft-status" role="status">
      <span v-if="draftError" class="field-error">{{ draftError }}</span>
      <span v-else-if="draftPending">正在保存草稿…</span>
      <span v-else-if="draftSavedAt">{{ restored ? '已恢复草稿 · ' : '' }}草稿保存于 {{ new Date(draftSavedAt).toLocaleString('zh-CN') }}</span>
      <span v-else>输入后自动保存到当前浏览器</span>
      <AppButton v-if="!savedProject" variant="ghost" @click="saveDraft">{{ draftError ? '重试保存草稿' : '保存草稿' }}</AppButton>
    </div>
    <details
      id="project-form-materials"
      class="project-materials"
      :open="materialsOpen"
      @toggle="materialsOpen = ($event.target as HTMLDetailsElement).open"
    >
      <summary>
        <span><FileUp :size="17" />从项目材料开始</span
        ><small>PDF / TXT 解析 · 扫描件 OCR · 图片附件</small><ChevronDown :size="16" />
      </summary>
      <p class="project-materials-hint">
        导入文档后可预览提取文字，选择追加到下方字段。请核对原文，已有填写不会自动覆盖。
      </p>
      <AttachmentUploader
        ref="attachmentPicker"
        :model-value="form.attachments ?? []"
        :disabled="projects.saving || !!savedProject"
        label="项目图片与文档（选填）"
        @update:model-value="form.attachments = $event.length ? $event : undefined"
        @busy="uploading = $event"
      />
      <p v-if="errors.attachments" class="field-error" role="alert">{{ errors.attachments }}</p>
      <section
        v-if="form.attachments?.some((file) => file.text) && !savedProject"
        class="document-import"
        aria-label="文档文字填入表单"
      >
        <strong>文档已解析，可选择文字填入表单</strong>
        <p>附件会随项目保存并用于分析。也可在下方选取文字追加到指定字段，原内容不会被覆盖。</p>
        <div class="defense-actions">
          <AppButton
            v-for="file in form.attachments.filter((file) => file.text)"
            :key="file.id"
            variant="secondary"
            :disabled="uploading"
            @click="selectDocument(file.text)"
            >选取 {{ file.name }} 的文字</AppButton
          >
        </div>
        <label
          >填入字段<select  v-model="importField">
            <option v-for="field in projectTextFields" :key="field.key" :value="field.key">
              {{ field.label }}
            </option>
          </select></label
        >
        <label for="document-import-text">待追加文字（可编辑）</label>
        <textarea
          id="document-import-text"
          v-model="importText"
          rows="5"
          placeholder="选择上方文档，在这里保留需要填写的文字…"
        />
        <p>
          {{ importText.length }} 字；目标字段上限 {{ projectTextLimits[importField] }} 字，当前已用
          {{ form[importField].length }} 字。
        </p>
        <p v-if="importError" role="alert" class="field-error">{{ importError }}</p>
        <AppButton
          variant="secondary"
          :disabled="uploading || !importText.trim()"
          @click="appendImport"
          >追加到{{ projectFieldLabels[importField] }}</AppButton
        >
      </section>
    </details>
    <div v-if="confirmExample" class="notice example-confirm" role="status">
      <p>载入示例会替换当前填写内容。</p>
      <div>
        <AppButton variant="secondary" @click="applyExample">确认替换</AppButton
        ><AppButton variant="ghost" @click="confirmExample = false">保留填写</AppButton>
      </div>
    </div>
    <div v-if="errorSummary.length" class="notice notice-error validation-summary" role="alert">
      <strong>还有 {{ errorSummary.length }} 项需要补充</strong>
      <ul>
        <li v-for="item in errorSummary" :key="item.field">
          <button class="control-button" type="button" @click="focusField(item.field)">
      {{ item.message }}</button>
        </li>
      </ul>
    </div>
    <div v-if="projects.saveError" class="notice notice-error" role="alert">
      <strong>项目尚未确认保存</strong>
      <p>{{ projects.saveError }}</p>
    </div>
    <div v-if="savedProject" class="notice notice-success" role="status">
      <Check :size="18" />
      <div>
        <strong>项目已创建</strong>
        <p>{{ navigationNote }}</p>
        <RouterLink
          :to="{ name: 'project-detail', params: { id: savedProject.id } }"
          class="text-button"
          >查看已创建项目 →</RouterLink
        >
      </div>
    </div>
    <fieldset :disabled="projects.saving || !!savedProject" class="form-controls">
      <section id="project-form-basics" class="project-form-section">
      <div class="form-section-label"><span>01</span>项目概况</div>
      <div class="project-basic-fields">
      <FormField
        id="project-name"
        label="项目名称"
        hint="一个清晰的名称，让评委快速理解你的方向。"
        :error="errors.name"
      >
        <input
          id="project-name"
          v-model="form.name"
          name="name"
          required
          autocomplete="off"
          :maxlength="projectTextLimits.name"
          placeholder="例如：校园循环 · 二手物品流转平台"
          :aria-invalid="!!errors.name"
          :aria-describedby="'project-name-hint' + (errors.name ? ' project-name-error' : '')"
          @blur="validateField('name')"
          @input="onInput('name')"
        />
        <span class="field-counter">{{ form.name.length }} / {{ projectTextLimits.name }}</span>
      </FormField>
      <FormField id="project-projectType" label="项目类型" :error="errors.projectType">
        <select
          id="project-projectType"
          v-model="form.projectType"
          name="projectType"
          required
          :aria-invalid="!!errors.projectType"
          :aria-describedby="errors.projectType ? 'project-projectType-error' : undefined"
          @change="onInput('projectType')"
        >
          <option v-for="type in projectTypes" :key="type" :value="type">
            {{ projectTypeLabels[type] }}
          </option>
        </select>
      </FormField>
      </div>
      </section>
      <section v-for="group in fieldGroups" :id="group.id" :key="group.id" class="project-form-section">
        <div class="form-section-label"><span>{{ group.number }}</span>{{ group.title }}</div>
        <FormField
          v-for="field in group.fields"
          :key="field.key"
          :id="'project-' + field.key"
          :label="field.label"
          :hint="field.hint"
          :error="errors[field.key]"
        >
          <textarea
            :id="'project-' + field.key"
            v-model="form[field.key]"
            :name="field.key"
            required
            :rows="field.rows"
            :maxlength="field.max"
            :placeholder="field.placeholder"
            :aria-invalid="!!errors[field.key]"
            :aria-describedby="
              'project-' +
              field.key +
              '-hint' +
              (errors[field.key] ? ' project-' + field.key + '-error' : '')
            "
            @blur="validateField(field.key)"
            @input="onInput(field.key)"
          ></textarea>
          <span class="field-counter">{{ form[field.key].length }} / {{ field.max }}</span>
        </FormField>
      </section>
      <div v-if="!expanded" class="project-expand-section"><p>先保存草稿也可以。准备创建项目时，再补充功能、技术方案与应用价值。</p><AppButton variant="secondary" @click="expanded = true">继续补充方案与价值 →</AppButton></div>
      <section v-if="expanded" class="project-form-section">
      <div class="form-section-label"><span>04</span>选择你的答辩强度</div>
      <fieldset v-if="expanded" class="difficulty-fieldset">
        <legend>答辩难度<span class="required-mark" aria-hidden="true">*</span></legend>
        <p id="difficulty-hint" class="field-hint">答辩提问将参考此难度设置。</p>
        <div class="difficulty-options">
          <label
            v-for="level in defenseDifficulties"
            :key="level"
            class="difficulty-option"
            :class="{ selected: form.difficulty === level }"
            ><input
              :id="level === 'normal' ? 'project-difficulty' : 'project-difficulty-' + level"
              v-model="form.difficulty"
              type="radio"
              name="difficulty"
              :value="level"
              required
              :aria-invalid="!!errors.difficulty"
              :aria-describedby="
                'difficulty-hint' + (errors.difficulty ? ' project-difficulty-error' : '')
              "
              @change="onInput('difficulty')"
            /><span
              ><strong>{{ difficultyLabels[level] }}</strong
              ><small>{{ difficultyDescriptions[level] }}</small></span
            ></label
          >
        </div>
        <p v-if="errors.difficulty" id="project-difficulty-error" class="field-error">
          {{ errors.difficulty }}
        </p>
      </fieldset>
      </section>
    </fieldset>
    <div id="project-form-save" class="form-submit-bar">
      <p>
        <ShieldCheck :size="15" /><span
          >项目资料保存到此浏览器，附件保存在本机后端。<br />上传与创建不调用模型；分析时才会发送资料与附件。</span
        >
      </p>
      <AppButton type="submit" :disabled="projects.saving || !!savedProject || uploading"
        ><LoaderCircle v-if="projects.saving" :size="16" class="spinning" />{{
          projects.saving ? '正在保存…' : savedProject ? '已保存' : project ? '保存项目新版本' : '保存项目并继续'
        }}<ArrowUpRight v-if="!projects.saving && !savedProject" :size="17"
      /></AppButton>
    </div>
  </form>
</template>
