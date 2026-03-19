<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import enSource from '@/locales/en.js'
import deSource from '@/locales/de.js'
import { deepCloneLocale, flattenLocaleStrings, unflattenLocaleStrings } from '@/utils/localeFlatten'
import { buildLocaleTreeFromFlatEntries } from '@/utils/localeTree'
import AdminLocaleTreeNode from '@/components/AdminLocaleTreeNode.vue'
import { submitLocalePullRequest } from '@/services/i18nPr'

const { t } = useI18n()

const baseEn = deepCloneLocale(enSource)
const baseDe = deepCloneLocale(deSource)

const tab = ref('en')
const dirty = ref(false)
const loading = ref(false)
const error = ref(null)
const prUrl = ref(null)
const prTitle = ref('')
const filter = ref('')

const flatEn = ref({})
const flatDe = ref({})

const filteredEntries = computed(() => {
  const f = tab.value === 'en' ? flatEn.value : flatDe.value
  const q = filter.value.trim().toLowerCase()
  const entries = Object.keys(f)
    .sort()
    .map((k) => [k, f[k]])
  if (!q) return entries
  return entries.filter(([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q))
})

/** Collapsible tree when not filtering; flat list when filter matches (all hits visible). */
const filterActive = computed(() => filter.value.trim().length > 0)

const localeTree = computed(() => buildLocaleTreeFromFlatEntries(filteredEntries.value))

function updateKey(path, value) {
  dirty.value = true
  if (tab.value === 'en') {
    flatEn.value = { ...flatEn.value, [path]: value }
  } else {
    flatDe.value = { ...flatDe.value, [path]: value }
  }
}

function resetLocale() {
  if (tab.value === 'en') {
    flatEn.value = flattenLocaleStrings(deepCloneLocale(baseEn))
  } else {
    flatDe.value = flattenLocaleStrings(deepCloneLocale(baseDe))
  }
  dirty.value = false
  error.value = null
  prUrl.value = null
}

async function openPr() {
  error.value = null
  prUrl.value = null
  const flat = tab.value === 'en' ? flatEn.value : flatDe.value
  let messages
  try {
    messages = unflattenLocaleStrings({ ...flat })
  } catch (e) {
    error.value = String(e?.message || e)
    return
  }
  loading.value = true
  try {
    const res = await submitLocalePullRequest(
      tab.value === 'en' ? 'en' : 'de',
      messages,
      prTitle.value.trim() || undefined
    )
    if (res?.pullRequestUrl) prUrl.value = res.pullRequestUrl
    dirty.value = false
  } catch (e) {
    error.value = e.response?.data?.error || e.message || 'Request failed'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  flatEn.value = flattenLocaleStrings(deepCloneLocale(baseEn))
  flatDe.value = flattenLocaleStrings(deepCloneLocale(baseDe))
})
</script>

<template>
  <div class="admin-translations">
    <p class="admin-back">
      <RouterLink to="/dashboard">{{ t('admin.backToDashboard') }}</RouterLink>
    </p>
    <h1 class="admin-title">{{ t('admin.i18nEditorTitle') }}</h1>
    <p class="admin-lead">{{ t('admin.i18nEditorLead') }}</p>

    <p class="admin-github-hint">{{ t('admin.i18nEditorGithubPrHint') }}</p>

    <div class="admin-toolbar">
      <div class="admin-tabs">
        <button
          type="button"
          :class="['admin-tab', tab === 'en' && 'active']"
          @click="tab = 'en'"
        >
          {{ t('admin.i18nEditorTabEn') }}
        </button>
        <button
          type="button"
          :class="['admin-tab', tab === 'de' && 'active']"
          @click="tab = 'de'"
        >
          {{ t('admin.i18nEditorTabDe') }}
        </button>
      </div>
      <label class="admin-filter">
        <span>{{ t('admin.i18nEditorFilter') }}</span>
        <input v-model="filter" type="search" class="admin-input" autocomplete="off" />
      </label>
    </div>

    <label class="admin-label">
      <span>{{ t('admin.i18nEditorPrTitle') }}</span>
      <input
        v-model="prTitle"
        type="text"
        class="admin-input"
        :placeholder="t('admin.i18nEditorPrTitlePlaceholder')"
      />
    </label>

    <div class="admin-actions">
      <button type="button" class="admin-btn-secondary" :disabled="loading" @click="resetLocale">
        {{ t('admin.i18nEditorReset') }}
      </button>
      <button
        type="button"
        class="admin-save"
        :disabled="loading || !dirty"
        @click="openPr"
      >
        <i v-if="loading" class="bi bi-arrow-repeat spin me-1" aria-hidden="true" />
        {{ t('admin.i18nEditorOpenPr') }}
      </button>
    </div>

    <p v-if="dirty" class="admin-dirty-hint">{{ t('admin.i18nEditorDirty') }}</p>
    <p v-if="error" class="admin-err">{{ error }}</p>
    <p v-if="prUrl" class="admin-success">
      {{ t('admin.i18nEditorPrCreated') }}
      <a :href="prUrl" target="_blank" rel="noopener noreferrer">{{ prUrl }}</a>
    </p>

    <div class="admin-table-wrap">
      <p v-if="filterActive && filteredEntries.length > 0" class="admin-filter-mode-hint">
        {{ t('admin.i18nEditorFilterFlatHint') }}
      </p>
      <div class="admin-locale-header">
        <span class="admin-locale-header-key">{{ t('admin.i18nEditorColKey') }}</span>
        <span>{{ t('admin.i18nEditorColValue') }}</span>
      </div>

      <p v-if="filteredEntries.length === 0" class="admin-locale-empty">{{ t('admin.i18nEditorNoKeys') }}</p>

      <template v-else>
        <!-- Search: flat table so every match is visible without opening sections -->
        <table v-if="filterActive" class="admin-locale-table">
          <tbody>
            <tr v-for="[path, val] in filteredEntries" :key="path">
              <td class="locale-key">{{ path }}</td>
              <td>
                <textarea
                  class="admin-input locale-val"
                  rows="2"
                  :value="val"
                  @input="updateKey(path, $event.target.value)"
                />
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Browse: nested collapsibles by key prefix -->
        <div v-else class="admin-locale-tree">
          <AdminLocaleTreeNode :node="localeTree" @update-key="updateKey" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.admin-translations {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 1.25rem 2rem;
}
.admin-back {
  margin-bottom: 0.5rem;
}
.admin-title {
  font-size: 1.35rem;
  margin-bottom: 0.35rem;
}
.admin-lead {
  color: var(--color-text-muted, #6c757d);
  margin-bottom: 1rem;
}
.admin-input {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: var(--radius, 0.375rem);
  background: var(--color-bg, #fff);
  color: var(--color-text, #212529);
  font-size: var(--text-base, 0.95rem);
  width: 100%;
  box-sizing: border-box;
}
.admin-input:focus {
  outline: none;
  border-color: var(--color-accent, #0d6efd);
}
.admin-btn-secondary {
  padding: 0.5rem 1rem;
  font-weight: 600;
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: var(--radius, 0.375rem);
  background: transparent;
  color: var(--color-text, #212529);
  cursor: pointer;
}
.admin-btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.admin-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.admin-github-hint {
  font-size: var(--text-sm, 0.875rem);
  color: var(--color-text-muted, #6c757d);
  margin-bottom: 1rem;
  line-height: 1.45;
}
.admin-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
  margin-bottom: 1rem;
}
.admin-tabs {
  display: flex;
  gap: 0.25rem;
}
.admin-tab {
  border: 1px solid var(--bs-border-color, #dee2e6);
  background: transparent;
  padding: 0.35rem 0.75rem;
  border-radius: 0.375rem;
  cursor: pointer;
}
.admin-tab.active {
  background: var(--bs-primary, #0d6efd);
  color: #fff;
  border-color: var(--bs-primary, #0d6efd);
}
.admin-filter {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 200px;
  flex: 1;
}
.admin-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: var(--text-sm, 0.875rem);
  font-weight: 600;
  margin-bottom: 0.75rem;
}
.admin-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.admin-dirty-hint {
  font-size: 0.875rem;
  color: var(--bs-warning-text-emphasis, #997404);
}
.admin-err {
  color: var(--bs-danger, #dc3545);
}
.admin-success {
  color: var(--bs-success, #198754);
}
.admin-table-wrap {
  overflow: auto;
  max-height: min(70vh, 720px);
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: var(--radius, 0.375rem);
}
.admin-filter-mode-hint {
  font-size: var(--text-sm, 0.8125rem);
  color: var(--color-text-muted, #6c757d);
  margin: 0;
  padding: 0.5rem 0.65rem;
  background: var(--color-surface-alt, #f8f9fa);
  border-bottom: 1px solid var(--color-border, #dee2e6);
}
.admin-locale-header {
  display: grid;
  grid-template-columns: minmax(160px, 28%) 1fr;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  font-size: var(--text-sm, 0.875rem);
  font-weight: 600;
  background: var(--color-surface-alt, #f8f9fa);
  border-bottom: 1px solid var(--color-border, #dee2e6);
  position: sticky;
  top: 0;
  z-index: 2;
}
.admin-locale-header-key {
  min-width: 0;
}
.admin-locale-tree {
  padding: 0.5rem 0.65rem 0.65rem;
}
.admin-locale-empty {
  margin: 0;
  padding: 1rem 0.65rem;
  color: var(--color-text-muted, #6c757d);
  font-size: var(--text-sm, 0.875rem);
}
.admin-locale-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm, 0.875rem);
}
.admin-locale-table td {
  border: 1px solid var(--color-border, #dee2e6);
  padding: 0.35rem 0.5rem;
  vertical-align: top;
}
.col-key {
  width: 28%;
  min-width: 180px;
}
.locale-key {
  font-family: ui-monospace, monospace;
  font-size: 0.75rem;
  word-break: break-word;
}
.locale-val {
  font-size: 0.875rem;
  min-height: 2.5rem;
  resize: vertical;
}
.spin {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
