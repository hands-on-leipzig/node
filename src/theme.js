import { ref } from 'vue'

const THEME_KEY = 'node-theme'

/** @type {import('vue').Ref<'light' | 'dark'>} */
export const theme = ref('light')

function applyTheme(themeValue) {
  const root = document.documentElement
  if (themeValue === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else {
    root.setAttribute('data-theme', 'light')
  }
}

/**
 * Get the current theme.
 * @returns {'light' | 'dark'}
 */
export function getTheme() {
  return theme.value
}

/**
 * Set theme and persist to localStorage.
 * @param {'light' | 'dark'} newTheme
 */
export function setTheme(newTheme) {
  if (newTheme !== 'light' && newTheme !== 'dark') return
  theme.value = newTheme
  applyTheme(newTheme)
  try {
    localStorage.setItem(THEME_KEY, newTheme)
  } catch (_) {}
}

/**
 * Initialize theme from localStorage and apply to document.
 * Call once before mounting the app to avoid flash.
 */
export function initTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') {
      theme.value = saved
    }
  } catch (_) {}
  applyTheme(theme.value)
}
