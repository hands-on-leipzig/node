<script setup>
defineProps({
  open: { type: Boolean, default: false },
  /** Optional file name shown under the status line */
  fileName: { type: String, default: '' },
})
</script>

<template>
  <Transition name="documents-file-opening-fade">
    <div
      v-if="open"
      class="documents-file-opening"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="documents-file-opening-inner">
        <i class="bi bi-arrow-repeat spin documents-file-opening-icon" aria-hidden="true" />
        <p class="documents-file-opening-title">
          <I18nText k="dashboard.documentsOpeningFile" />
        </p>
        <p v-if="fileName" class="documents-file-opening-name">{{ fileName }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.documents-file-opening {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  border-radius: inherit;
  background: color-mix(in srgb, var(--color-bg) 78%, transparent);
  backdrop-filter: blur(2px);
}
.documents-file-opening-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  max-width: 16rem;
  padding: 1rem 1.15rem;
  text-align: center;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, #2563eb 28%, var(--color-border));
  background: var(--liquid-tile-bg-strong, var(--liquid-tile-bg-inner));
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.12);
}
.documents-file-opening-icon {
  font-size: 1.65rem;
  color: #2563eb;
}
.documents-file-opening-title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}
.documents-file-opening-name {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.documents-file-opening-fade-enter-active,
.documents-file-opening-fade-leave-active {
  transition: opacity 0.15s ease;
}
.documents-file-opening-fade-enter-from,
.documents-file-opening-fade-leave-to {
  opacity: 0;
}
</style>
