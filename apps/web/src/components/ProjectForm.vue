<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { ArrowUpRight, Check, FileText, ShieldCheck, LoaderCircle } from 'lucide-vue-next'
import {
  defenseDifficulties,
  difficultyDescriptions,
  difficultyLabels,
  projectTypes,
  projectTypeLabels,
  projectTextLimits,
  type Project,
  type ProjectField,
} from '@defense/shared'
import AppButton from './ui/AppButton.vue'
import FormField from './ui/FormField.vue'
import { useProjectForm } from '../composables/useProjectForm'
import { useProjectsStore } from '../stores/projects'
import { exampleProject, projectTextFields } from '../data/project-form'

const emit = defineEmits<{ created: [project: Project] }>()
const { form, errors, errorSummary, hasContent, validateField, submit } = useProjectForm()
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
  if (savedProject.value || projects.saving) return
  const project = await submit()
  if (!project) {
    const firstError = Object.keys(errors.value)[0]
    if (firstError) await focusField(firstError)
    return
  }
  savedProject.value = project
  emit('created', project)
}
</script>
<template>
  <form
    ref="formElement"
    class="project-form"
    novalidate
    :aria-busy="projects.saving"
    @submit.prevent="save"
  >
    <div class="form-panel-heading">
      <div>
        <span class="section-kicker">PROJECT BRIEF</span>
        <h2>先把你的项目，讲清楚。</h2>
        <p>所有字段均为必填；尚未确定的内容，可以如实注明“待验证”。</p>
      </div>
      <AppButton
        variant="secondary"
        :disabled="projects.saving || !!savedProject"
        @click="loadExample"
        ><FileText :size="14" />载入示例</AppButton
      >
    </div>
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
          <button type="button" @click="focusField(item.field)">{{ item.message }}</button>
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
      <div class="form-section-label"><span>01</span>项目概况</div>
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
      <template v-for="(field, index) in projectTextFields" :key="field.key">
        <div v-if="index === 1" class="form-section-label"><span>02</span>用户、方案与价值</div>
        <FormField
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
      </template>
      <div class="form-section-label"><span>03</span>选择你的答辩强度</div>
      <fieldset class="difficulty-fieldset">
        <legend>答辩难度<span class="required-mark" aria-hidden="true">*</span></legend>
        <p id="difficulty-hint" class="field-hint">本轮保存难度偏好，后续 AI 训练将使用此设置。</p>
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
    </fieldset>
    <div class="form-submit-bar">
      <p>
        <ShieldCheck :size="15" /><span
          >仅保存到当前浏览器，清除浏览器数据后将丢失。<br />创建时不调用模型；点击项目分析时才会发送资料。</span
        >
      </p>
      <AppButton type="submit" :disabled="projects.saving || !!savedProject"
        ><LoaderCircle v-if="projects.saving" :size="16" class="spinning" />{{
          projects.saving ? '正在保存…' : savedProject ? '已保存' : '创建项目'
        }}<ArrowUpRight v-if="!projects.saving && !savedProject" :size="17"
      /></AppButton>
    </div>
  </form>
</template>
