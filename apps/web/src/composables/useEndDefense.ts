import { ref, watch, type Ref } from 'vue'
export function useEndDefense(disabled: Ref<boolean>, end: () => void) {
  const confirming = ref(false)
  watch(disabled, value => {if (value) confirming.value = false})
  return {
    confirming,
    request: () => {if (!disabled.value) confirming.value = true},
    cancel: () => {confirming.value = false},
    confirm: () => {if (confirming.value && !disabled.value) end()},
  }
}
