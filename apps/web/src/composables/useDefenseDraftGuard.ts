import { onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useDefenseStore } from '../stores/defense'

export function useDefenseDraftGuard() {
  const store = useDefenseStore()
  const unsaved = () => !store.draftSaved && (!!store.draft.trim() || store.draftAttachments.length > 0)
  function protect(event: BeforeUnloadEvent) {
    if (!unsaved()) return
    event.preventDefault()
    event.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', protect))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', protect))
  onBeforeRouteLeave(() => !unsaved() || window.confirm('回答草稿尚未确认保存，离开可能丢失输入。仍要离开吗？'))
}
