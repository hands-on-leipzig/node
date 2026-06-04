<script setup>
import { computed } from 'vue'
import DocumentsFolderTree from './DocumentsFolderTree.vue'
import { countFilesInDocumentTree } from '@/utils/documentsTree'
import {
  documentFileIconBiSuffix,
  documentFileVisualKind,
  isPdfDocumentFile,
} from '@/utils/documentFileIcon'

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
const emit = defineEmits(['open-pdf', 'open-file'])

function onFileClick(event, file) {
  if (file?.graphItem && file?.driveId && file?.itemId) {
    event.preventDefault()
    emit('open-file', file)
    return
  }
  if (!isPdfDocumentFile(file)) return
  event.preventDefault()
  emit('open-pdf', { url: file.url, name: file.name || 'PDF' })
}

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
    <div v-if="hasRootFiles" class="doc-folder-tree-files">
      <ul class="doc-folder-tree-file-list">
        <li v-for="(f, i) in node.files" :key="'file-' + depth + '-' + i + '-' + f.url">
        <a
          :href="f.url"
          class="doc-folder-tree-file-link"
          target="_blank"
          rel="noopener noreferrer"
          @click="onFileClick($event, f)"
        >
          <span
            class="doc-folder-tree-file-icon-wrap"
            :class="'doc-folder-tree-file-icon-wrap--' + documentFileVisualKind(f)"
            aria-hidden="true"
          >
            <i :class="['bi', 'bi-' + documentFileIconBiSuffix(f), 'doc-folder-tree-file-icon']" />
          </span>
          <span class="doc-folder-tree-file-name">{{ f.name }}</span>
          <i class="bi bi-box-arrow-up-right doc-folder-tree-file-external" aria-hidden="true" />
        </a>
        </li>
      </ul>
    </div>
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
          <DocumentsFolderTree
            :node="fd.node"
            :depth="depth + 1"
            @open-pdf="emit('open-pdf', $event)"
            @open-file="emit('open-file', $event)"
          />
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
/* —— Root vs. inside folder: nested trees get a guide rail so “in Ordner” reads clearly —— */
.doc-folder-tree {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.doc-folder-tree--nested {
  margin-top: 0.35rem;
  padding-left: 0.65rem;
  margin-left: 0.2rem;
  border-left: 2px solid color-mix(in srgb, #2563eb 32%, var(--color-border));
}
/* Dateien = kühler Blau-Akzent (wie Dokumente-Karte), klar von Ordner-Kacheln getrennt */
.doc-folder-tree-files {
  padding: 0.5rem 0.55rem 0.55rem 0.65rem;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, #2563eb 26%, var(--color-border));
  border-left: 4px solid #2563eb;
  background: color-mix(in srgb, #2563eb 9%, var(--color-bg));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.doc-folder-tree-file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.doc-folder-tree-file-link {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.65rem;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
  background: var(--liquid-tile-bg-strong, var(--liquid-tile-bg-inner));
  border-radius: var(--radius);
  text-decoration: none;
  border: 1px solid color-mix(in srgb, #2563eb 14%, var(--color-border));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 1px 0 rgba(0, 0, 0, 0.03);
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    color 0.18s ease;
}
.doc-folder-tree-file-link:hover {
  border-color: color-mix(in srgb, #2563eb 45%, var(--color-border));
  background: color-mix(in srgb, var(--liquid-tile-bg-inner) 82%, var(--color-accent-soft));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 1px 2px rgba(37, 99, 235, 0.08);
  color: var(--color-text);
}
.doc-folder-tree-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.doc-folder-tree-file-external {
  flex-shrink: 0;
  font-size: 0.72rem;
  opacity: 0.38;
  transition: opacity 0.18s ease;
}
.doc-folder-tree-file-link:hover .doc-folder-tree-file-external {
  opacity: 0.65;
}
.doc-folder-tree-file-icon-wrap {
  width: 2.375rem;
  height: 2.375rem;
  border-radius: var(--radius);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--liquid-tile-bg-inner) 92%, var(--color-bg-muted));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition: border-color 0.18s ease, background 0.18s ease;
}
.doc-folder-tree-file-icon {
  font-size: 1.35rem;
  line-height: 1;
}
.doc-folder-tree-file-icon-wrap--pdf {
  border-color: color-mix(in srgb, #ef4444 38%, var(--color-border));
  background: color-mix(in srgb, #ef4444 14%, var(--liquid-tile-bg-inner));
}
.doc-folder-tree-file-icon-wrap--pdf .doc-folder-tree-file-icon {
  color: #dc2626;
}
.doc-folder-tree-file-icon-wrap--video {
  border-color: color-mix(in srgb, #6366f1 38%, var(--color-border));
  background: color-mix(in srgb, #6366f1 14%, var(--liquid-tile-bg-inner));
}
.doc-folder-tree-file-icon-wrap--video .doc-folder-tree-file-icon {
  color: #4f46e5;
}
.doc-folder-tree-file-icon-wrap--audio {
  border-color: color-mix(in srgb, #a855f7 38%, var(--color-border));
  background: color-mix(in srgb, #a855f7 12%, var(--liquid-tile-bg-inner));
}
.doc-folder-tree-file-icon-wrap--audio .doc-folder-tree-file-icon {
  color: #9333ea;
}
.doc-folder-tree-file-icon-wrap--image {
  border-color: color-mix(in srgb, #10b981 38%, var(--color-border));
  background: color-mix(in srgb, #10b981 12%, var(--liquid-tile-bg-inner));
}
.doc-folder-tree-file-icon-wrap--image .doc-folder-tree-file-icon {
  color: #059669;
}
.doc-folder-tree-file-icon-wrap--sheet {
  border-color: color-mix(in srgb, #16a34a 32%, var(--color-border));
  background: color-mix(in srgb, #16a34a 10%, var(--liquid-tile-bg-inner));
}
.doc-folder-tree-file-icon-wrap--sheet .doc-folder-tree-file-icon {
  color: #15803d;
}
.doc-folder-tree-file-icon-wrap--slide {
  border-color: color-mix(in srgb, #ea580c 34%, var(--color-border));
  background: color-mix(in srgb, #ea580c 11%, var(--liquid-tile-bg-inner));
}
.doc-folder-tree-file-icon-wrap--slide .doc-folder-tree-file-icon {
  color: #c2410c;
}
.doc-folder-tree-file-icon-wrap--archive {
  border-color: color-mix(in srgb, #78716c 40%, var(--color-border));
  background: color-mix(in srgb, #78716c 10%, var(--liquid-tile-bg-inner));
}
.doc-folder-tree-file-icon-wrap--archive .doc-folder-tree-file-icon {
  color: #57534e;
}
.doc-folder-tree-file-icon-wrap--doc {
  border-color: color-mix(in srgb, #2563eb 34%, var(--color-border));
  background: color-mix(in srgb, #2563eb 11%, var(--liquid-tile-bg-inner));
}
.doc-folder-tree-file-icon-wrap--doc .doc-folder-tree-file-icon {
  color: #1d4ed8;
}
.doc-folder-tree-file-icon-wrap--text {
  border-color: color-mix(in srgb, #64748b 34%, var(--color-border));
  background: color-mix(in srgb, #64748b 9%, var(--liquid-tile-bg-inner));
}
.doc-folder-tree-file-icon-wrap--text .doc-folder-tree-file-icon {
  color: #475569;
}
.doc-folder-tree-file-icon-wrap--file .doc-folder-tree-file-icon {
  color: var(--color-accent);
}
.doc-folder-tree-folders {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
/* Ordner = warmer Bernstein-Akzent, wirkt wie “Tabs” / Gruppierung */
.doc-folder-tree-accordion {
  border: 1px solid color-mix(in srgb, #b45309 28%, var(--color-border));
  border-left: 4px solid #b45309;
  border-radius: var(--radius);
  background: color-mix(in srgb, #f59e0b 11%, var(--liquid-tile-bg-inner));
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 1px 2px rgba(180, 83, 9, 0.07);
}
.doc-folder-tree-accordion--nested {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 1px 2px rgba(0, 0, 0, 0.06);
}
.doc-folder-tree-accordion[open] {
  border-color: color-mix(in srgb, #b45309 38%, var(--color-border));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 2px 8px rgba(180, 83, 9, 0.1);
}
.doc-folder-tree-summary {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 0.7rem;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
  background: color-mix(in srgb, #f59e0b 14%, transparent);
}
.doc-folder-tree-summary::-webkit-details-marker {
  display: none;
}
.doc-folder-tree-summary:hover {
  background: color-mix(in srgb, #f59e0b 22%, var(--color-bg-hover));
}
.doc-folder-tree-chevron {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: color-mix(in srgb, #b45309 75%, var(--color-text-muted));
  opacity: 0.9;
  transition: transform 0.2s ease;
}
.doc-folder-tree-accordion[open] .doc-folder-tree-chevron {
  transform: rotate(90deg);
}
.doc-folder-tree-folder-icon {
  flex-shrink: 0;
  font-size: 1.15rem;
  color: #b45309;
  opacity: 1;
  filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.35));
}
.doc-folder-tree-title {
  flex: 1;
  min-width: 0;
  text-align: left;
  letter-spacing: 0.01em;
}
.doc-folder-tree-count {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: color-mix(in srgb, #92400e 55%, var(--color-text-muted));
  background: color-mix(in srgb, #fef3c7 55%, var(--color-bg-muted));
  border: 1px solid color-mix(in srgb, #b45309 22%, var(--color-border));
  border-radius: var(--radius-full);
  padding: 0.12rem 0.5rem;
}
/* Inhalt unter dem Ordner: etwas kühler / flacher als die Ordner-Leiste */
.doc-folder-tree-panel {
  padding: 0.55rem 0.65rem 0.65rem;
  border-top: 1px solid color-mix(in srgb, #b45309 18%, var(--color-border));
  background: color-mix(in srgb, #64748b 5%, var(--color-bg));
}
</style>

<style>
/* Ordner-Badge: im Dark-Theme weniger “Post-it”, besser lesbar */
html[data-theme='dark'] .doc-folder-tree-count {
  background: color-mix(in srgb, #b45309 18%, var(--color-bg-muted));
  color: var(--color-text-muted);
  border-color: color-mix(in srgb, #f59e0b 28%, var(--color-border));
}
html[data-theme='dark'] .doc-folder-tree-summary {
  background: color-mix(in srgb, #f59e0b 8%, transparent);
}
html[data-theme='dark'] .doc-folder-tree-summary:hover {
  background: color-mix(in srgb, #f59e0b 14%, var(--color-bg-hover));
}
</style>
