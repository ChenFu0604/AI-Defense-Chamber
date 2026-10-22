import { ref, watch, type Ref } from 'vue'
import type { DefenseSession, DiscussionTopicId, TopicStateRequest } from '@defense/shared'
export function useDiscussionEditor(session: Ref<DefenseSession>, update: (input: Omit<TopicStateRequest,'requestId'>) => void) {
  const editing = ref<DiscussionTopicId | null>(null), note = ref(''), status = ref<TopicStateRequest['status']>('paused')
  const error = ref(''), editRevision = ref(0), savedMessage = ref('')
  watch(() => session.value.discussion?.revision, () => {
    if (!editing.value) return
    const latest = session.value.discussion?.edits.at(-1)
    if (latest?.topicId === editing.value && latest.status === status.value && latest.note === note.value.trim()) {
      editing.value = null; savedMessage.value = '议题更正已保存。'
    } else error.value = '议题已更新。请收起后重新打开更正表单，核对最新状态。'
  })
  function edit(id: DiscussionTopicId) {
    editing.value=id;note.value='';status.value='paused';error.value='';savedMessage.value=''
    editRevision.value=session.value.discussion!.revision
  }
  function save(id: DiscussionTopicId) {
    if (!note.value.trim()) {error.value='请写一句更正原因，方便后续评委理解。';return}
    if (session.value.discussion?.revision !== editRevision.value) {error.value='议题已更新，请重新打开更正表单。';return}
    update({topicId:id,status:status.value,note:note.value.trim(),expectedRevision:editRevision.value})
  }
  return {editing,note,status,error,savedMessage,edit,save}
}
