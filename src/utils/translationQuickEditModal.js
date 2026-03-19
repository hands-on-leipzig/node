import { ref, shallowRef } from 'vue'

export const translationQuickEditOpen = ref(false)
export const translationQuickEditKey = shallowRef('')

export function openTranslationQuickEdit(key) {
  if (typeof key === 'string' && key.trim()) {
    translationQuickEditKey.value = key.trim()
    translationQuickEditOpen.value = true
  }
}

export function closeTranslationQuickEdit() {
  translationQuickEditOpen.value = false
}
