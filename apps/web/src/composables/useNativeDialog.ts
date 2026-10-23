import { onScopeDispose, watch, type Ref } from 'vue'

/** Native modal dialogs provide focus containment, Escape and trigger-focus restoration. */
export function useNativeDialog(element: Ref<HTMLDialogElement | null>, visible: Readonly<Ref<boolean>>, dismiss: () => void) {
  watch([element, visible], ([dialog, open]) => {
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, { immediate: true, flush: 'post' })
  onScopeDispose(() => { if (element.value?.open) element.value.close() })
  function cancel(event: Event) { event.preventDefault(); dismiss() }
  function closed() { if (visible.value) dismiss() }
  function backdrop(event: MouseEvent) {
    if (event.target !== element.value || !element.value) return
    const rect = element.value.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss()
  }
  return { cancel, closed, backdrop }
}
