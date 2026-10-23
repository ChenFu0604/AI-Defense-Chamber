import { nextTick, ref, watch, type Ref } from 'vue'

export function useConversationScroll(
  feed: Ref<HTMLElement | null>,
  revision: () => unknown,
) {
  const following = ref(true), unread = ref(false)
  function onScroll() {
    if (!feed.value) return
    following.value = feed.value.scrollHeight - feed.value.scrollTop - feed.value.clientHeight < 100
    if (following.value) unread.value = false
  }
  function jumpToLatest() {
    if (feed.value) feed.value.scrollTop = feed.value.scrollHeight
    following.value = true
    unread.value = false
  }
  watch(revision, async (_value, _previous, onCleanup) => {
    let active = true
    onCleanup(() => { active = false })
    await nextTick()
    if (!active || !feed.value) return
    if (following.value) jumpToLatest()
    else unread.value = true
  }, { immediate: true })
  return { following, unread, onScroll, jumpToLatest }
}
