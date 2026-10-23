/** Enter sends; Shift+Enter is a newline. IME confirmation must never send an answer. */
export function isAnswerShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'isComposing' | 'repeat'> & { keyCode?: number }) {
  return event.key === 'Enter' && !event.shiftKey && !event.altKey
    && !event.isComposing && event.keyCode !== 229 && !event.repeat
}
