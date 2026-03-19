<script setup>
import AdminLocaleNavNode from './AdminLocaleNavNode.vue'

/**
 * Left pane: collapsible key hierarchy (same pattern as the original editor tree).
 * Leaf names scroll the matching row on the right.
 */
defineProps({
  node: {
    type: Object,
    required: true,
  },
  pathPrefix: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['scroll-to-path'])

function branchPath(prefix, key) {
  return prefix ? `${prefix}.${key}` : key
}

function onScrollToLeaf(path) {
  emit('scroll-to-path', path)
}
</script>

<template>
  <div class="nav-node">
    <template v-for="branch in node.branches" :key="branch.key">
      <details class="locale-details">
        <summary class="locale-summary">
          <i class="bi bi-chevron-right locale-chevron" aria-hidden="true" />
          <span class="locale-summary-label">{{ branch.key }}</span>
          <span class="locale-summary-count">({{ branch.count }})</span>
        </summary>
        <div class="locale-details-inner">
          <AdminLocaleNavNode
            :node="branch.node"
            :path-prefix="branchPath(pathPrefix, branch.key)"
            @scroll-to-path="(p) => emit('scroll-to-path', p)"
          />
        </div>
      </details>
    </template>

    <ul v-if="node.leaves.length" class="nav-leaves">
      <li v-for="leaf in node.leaves" :key="leaf.path">
        <button type="button" class="nav-leaf" @click="onScrollToLeaf(leaf.path)">
          {{ leaf.segment }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.nav-node {
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
.nav-leaves {
  list-style: none;
  margin: 0.15rem 0 0.35rem 0;
  padding: 0 0 0 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.nav-leaf {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.2rem 0.35rem;
  border: none;
  border-radius: 0.25rem;
  background: transparent;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  color: var(--color-accent, #0d6efd);
  cursor: pointer;
  word-break: break-word;
}
.nav-leaf:hover {
  text-decoration: underline;
  background: var(--color-accent-soft, rgba(13, 110, 253, 0.08));
}
</style>
