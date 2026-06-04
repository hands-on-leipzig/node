<script setup>
import { watch } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  pdfUrl: { type: String, default: '' },
  title: { type: String, default: '' },
})

const emit = defineEmits(['close'])

function onBackdropClick(e) {
  if (e.target === e.currentTarget) emit('close')
}

watch(
  () => props.show,
  (visible) => {
    if (visible) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="pdf-modal">
      <div
        v-if="show"
        class="pdf-modal-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="title || 'PDF viewer'"
        @click="onBackdropClick"
      >
        <div class="pdf-modal-box">
          <div class="pdf-modal-header">
            <span v-if="title" class="pdf-modal-title">{{ title }}</span>
            <button
              type="button"
              class="pdf-modal-close"
              aria-label="Close"
              @click="emit('close')"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="pdf-modal-body">
            <iframe
              v-if="pdfUrl"
              :src="pdfUrl"
              class="pdf-modal-iframe"
              title="PDF document"
            ></iframe>
            <p v-else class="pdf-modal-empty">{{ title || 'No document available.' }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Mobile: edge-to-edge PDF. From 640px: ~2em margin around the viewer. */
.pdf-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  padding:
    env(safe-area-inset-top, 0)
    env(safe-area-inset-right, 0)
    env(safe-area-inset-bottom, 0)
    env(safe-area-inset-left, 0);
  background: var(--liquid-modal-scrim-bg);
}

.pdf-modal-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  max-height: 100dvh;
  max-height: 100vh;
  background: var(--liquid-popover-fill);
  border: none;
  border-radius: 0;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
}

@media (min-width: 640px) {
  .pdf-modal-backdrop {
    padding:
      max(2em, env(safe-area-inset-top, 0px))
      max(2em, env(safe-area-inset-right, 0px))
      max(2em, env(safe-area-inset-bottom, 0px))
      max(2em, env(safe-area-inset-left, 0px));
  }

  .pdf-modal-box {
    border: 1px solid var(--liquid-border);
    border-radius: var(--radius-lg);
  }
}

.pdf-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.pdf-modal-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-modal-close {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.pdf-modal-close:hover {
  background: var(--color-bg-muted);
  color: var(--color-text);
}

.pdf-modal-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.pdf-modal-iframe {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: none;
}

.pdf-modal-empty {
  padding: 2rem;
  color: var(--color-text-muted);
  margin: 0;
}

.pdf-modal-enter-active,
.pdf-modal-leave-active {
  transition: opacity 0.2s ease;
}

.pdf-modal-enter-active .pdf-modal-box,
.pdf-modal-leave-active .pdf-modal-box {
  transition: transform 0.2s ease;
}

.pdf-modal-enter-from,
.pdf-modal-leave-to {
  opacity: 0;
}

.pdf-modal-enter-from .pdf-modal-box,
.pdf-modal-leave-to .pdf-modal-box {
  transform: scale(0.98);
}
</style>
