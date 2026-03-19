import { ref } from 'vue'

/** Shown after translation edits (draft saved) until dismissed or all drafts cleared. */
export const showGithubExportBanner = ref(false)

export function notifyTranslationDraftSaved() {
  showGithubExportBanner.value = true
}

export function dismissGithubExportBanner() {
  showGithubExportBanner.value = false
}
