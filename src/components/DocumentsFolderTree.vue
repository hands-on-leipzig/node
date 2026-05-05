<script setup>
import { computed } from 'vue'
import DocumentsFolderTree from './DocumentsFolderTree.vue'
import { countFilesInDocumentTree } from '@/utils/documentsTree'

const props = defineProps({
  /** @type {{ files: Array<{ name: string, url: string }>, folders: Array<{ name: string, node: object }> }} */
  node: {
    type: Object,
    required: true,
  },
  depth: {
    type: Number,
    default: 0,
  },
})

function subtreeCount(sub) {
  return countFilesInDocumentTree(sub)
}

const hasRootFiles = computed(() => (props.node.files?.length || 0) > 0)
const hasFolders = computed(() => (props.node.folders?.length || 0) > 0)
</script>

<template>
  <div
    class="doc-folder-tree"
    :class="{ 'doc-folder-tree--nested': depth > 0 }"
  >
    <ul
      v-if="hasRootFiles"
      class="doc-folder-tree-file-list"
    >
      <li v-for="(f, i) in node.files" :key="'file-' + depth + '-' + i + '-' + f.url">
        <a
          :href="f.url"
          class="doc-folder-tree-file-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i class="bi bi-file-earmark-arrow-down" aria-hidden="true" />
          <span>{{ f.name }}</span>
        </a>
      </li>
    </ul>
    <div v-if="hasFolders" class="doc-folder-tree-folders">
      <details
        v-for="(fd, idx) in node.folders"
        :key="'dir-' + depth + '-' + fd.name"
        class="doc-folder-tree-accordion"
        :class="{ 'doc-folder-tree-accordion--nested': depth > 0 }"
        :open="depth === 0 && idx === 0"
      >
        <summary class="doc-folder-tree-summary">
          <i class="bi bi-chevron-down doc-folder-tree-chevron" aria-hidden="true" />
          <i class="bi bi-folder2 doc-folder-tree-folder-icon" aria-hidden="true" />
          <span class="doc-folder-tree-title">{{ fd.name }}</span>
          <span class="doc-folder-tree-count">{{ subtreeCount(fd.node) }}</span>
        </summary>
        <div class="doc-folder-tree-panel">
          <DocumentsFolderTree :node="fd.node" :depth="depth + 1" />
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.doc-folder-tree {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.doc-folder-tree--nested {
  margin-top: 0.25rem;
}
.doc-folder-tree-file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.doc-folder-tree-file-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  font-size: var(--text-sm);
  color: var(--color-text);
  background: var(--color-bg-muted);
  border-radius: var(--radius);
  text-decoration: none;
  border: 1px solid var(--color-border);
  transition: border-color 0.15s, background 0.15s;
}
.doc-folder-tree-file-link:hover {
  border-color: var(--color-accent);
  background: var(--color-bg);
  color: var(--color-accent);
}
.doc-folder-tree-file-link .bi {
  flex-shrink: 0;
  color: var(--color-accent);
}
.doc-folder-tree-folders {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.doc-folder-tree-accordion {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-muted);
  overflow: hidden;
}
.doc-folder-tree-accordion--nested {
  margin-left: 0.35rem;
}
.doc-folder-tree-summary {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 0.65rem;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.doc-folder-tree-summary::-webkit-details-marker {
  display: none;
}
.doc-folder-tree-summary:hover {
  background: var(--color-bg-hover);
}
.doc-folder-tree-chevron {
  flex-shrink: 0;
  font-size: 0.75rem;
  opacity: 0.65;
  transition: transform 0.2s ease;
}
.doc-folder-tree-accordion[open] .doc-folder-tree-chevron {
  transform: rotate(90deg);
}
.doc-folder-tree-folder-icon {
  flex-shrink: 0;
  font-size: 1.05rem;
  color: var(--color-accent);
  opacity: 0.95;
}
.doc-folder-tree-title {
  flex: 1;
  min-width: 0;
  text-align: left;
}
.doc-folder-tree-count {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text-muted);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: 0.1rem 0.45rem;
}
.doc-folder-tree-panel {
  padding: 0 0.65rem 0.65rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);
}
</style>
