<script setup>
import AdminLocaleTreeNode from './AdminLocaleTreeNode.vue'

/**
 * Recursive collapsible groups for flat locale keys (dot paths).
 */
defineProps({
  node: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update-key'])
</script>

<template>
  <div class="locale-tree-node">
    <template v-for="branch in node.branches" :key="branch.key">
      <details class="locale-details">
        <summary class="locale-summary">
          <i class="bi bi-chevron-right locale-chevron" aria-hidden="true" />
          <span class="locale-summary-label">{{ branch.key }}</span>
          <span class="locale-summary-count">({{ branch.count }})</span>
        </summary>
        <div class="locale-details-inner">
          <AdminLocaleTreeNode :node="branch.node" @update-key="(p, v) => emit('update-key', p, v)" />
        </div>
      </details>
    </template>

    <div v-for="leaf in node.leaves" :key="leaf.path" class="locale-row">
      <div class="locale-key-cell">
        <span class="locale-key-text">{{ leaf.path }}</span>
      </div>
      <div class="locale-val-cell">
        <textarea
          class="admin-input locale-val"
          rows="2"
          :value="leaf.value"
          @input="emit('update-key', leaf.path, $event.target.value)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.locale-tree-node {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.locale-details {
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: var(--radius, 0.375rem);
  margin-bottom: 0.35rem;
  background: var(--color-bg, #fff);
  overflow: hidden;
}
.locale-details:last-of-type {
  margin-bottom: 0.25rem;
}
.locale-summary {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.6rem;
  cursor: pointer;
  font-weight: 600;
  font-size: var(--text-sm, 0.875rem);
  list-style: none;
  background: var(--color-surface-alt, #f1f3f5);
  color: var(--color-text, #212529);
  user-select: none;
}
.locale-summary::-webkit-details-marker {
  display: none;
}
.locale-summary::marker {
  content: '';
}
.locale-chevron {
  font-size: 0.65rem;
  opacity: 0.75;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}
.locale-details[open] .locale-chevron {
  transform: rotate(90deg);
}
.locale-summary-label {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
.locale-summary-count {
  font-size: 0.75rem;
  font-weight: 500;
  opacity: 0.65;
  flex-shrink: 0;
}
.locale-details-inner {
  padding: 0.35rem 0.35rem 0.5rem 0.75rem;
  border-top: 1px solid var(--color-border, #dee2e6);
  background: var(--color-bg, #fff);
}
.locale-row {
  display: grid;
  grid-template-columns: minmax(160px, 28%) 1fr;
  gap: 0.5rem;
  align-items: start;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--color-border, #e9ecef);
}
.locale-row:last-child {
  border-bottom: none;
}
.locale-key-cell {
  min-width: 0;
}
.locale-key-text {
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  word-break: break-word;
  line-height: 1.35;
  color: var(--color-text-muted, #495057);
}
.locale-val-cell {
  min-width: 0;
}
.locale-val {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: var(--radius, 0.375rem);
  background: var(--color-bg, #fff);
  color: var(--color-text, #212529);
  font-size: 0.875rem;
  min-height: 2.5rem;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
}
.locale-val:focus {
  outline: none;
  border-color: var(--color-accent, #0d6efd);
}
</style>
