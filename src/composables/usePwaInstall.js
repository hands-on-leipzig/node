import { computed, onMounted, onUnmounted, ref } from 'vue'

export function usePwaInstall() {
  const deferredPrompt = ref(null)
  const installed = ref(false)

  function onBeforeInstallPrompt(event) {
    event.preventDefault()
    deferredPrompt.value = event
  }

  function onInstalled() {
    installed.value = true
    deferredPrompt.value = null
  }

  async function promptInstall() {
    if (!deferredPrompt.value) return false
    deferredPrompt.value.prompt()
    const choice = await deferredPrompt.value.userChoice
    if (choice?.outcome === 'accepted') {
      deferredPrompt.value = null
      return true
    }
    return false
  }

  const canInstall = computed(() => !!deferredPrompt.value && !installed.value)

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
  })
  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  })

  return { canInstall, promptInstall, installed }
}
