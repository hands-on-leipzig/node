<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import enSource from '@/locales/en.js'
import deSource from '@/locales/de.js'
import { deepCloneLocale, flattenLocaleStrings, unflattenLocaleStrings } from '@/utils/localeFlatten'
import { buildLocaleTreeFromBilingualRows } from '@/utils/localeTree'
import { localePathDomId } from '@/utils/localeEditorIds'
import AdminLocaleNavNode from '@/components/AdminLocaleNavNode.vue'
import { submitLocalesPullRequest } from '@/services/i18nPr'
import {
  loadAllLocaleDrafts,
  patchLocaleDraft,
  clearLocaleDraft,
  countLocaleDraftKeys,
} from '@/utils/localeDrafts'
import {
  fetchSiteBuildInfo,
  isLocalDevBuildInfo,
  formatBuildInfoShort,
  buildInfoFingerprint,
} from '@/utils/siteBuildInfo'

const { t } = useI18n()
const route = useRoute()

const baseEn = deepCloneLocale(enSource)
const baseDe = deepCloneLocale(deSource)

const dirty = ref(false)
const loading = ref(false)
const error = ref(null)
const prUrl = ref(null)
const filter = ref('')

const flatEn = ref({})
const flatDe = ref({})
const draftTick = ref(0)
const editorRoot = ref(null)

/** Current deployed build (from /build-info.json). */
const siteBuildInfo = ref(null)
const siteBuildFetchDone = ref(false)
/** After a successful PR: watch for new deploy. */
const deployWatch = ref(null) // 'polling' | 'ready' | 'timeout' | 'local-skip' | null

let deployPollTimer = null

function stopDeployWatch() {
  if (deployPollTimer != null) {
    clearInterval(deployPollTimer)
    deployPollTimer = null
  }
}

async function refreshSiteBuild() {
  siteBuildInfo.value = await fetchSiteBuildInfo()
  siteBuildFetchDone.value = true
}

function startDeployWatchAfterPr() {
  stopDeployWatch()
  deployWatch.value = null
  void (async () => {
    const baseline = await fetchSiteBuildInfo()
    if (!baseline) {
      deployWatch.value = 'timeout'
      return
    }
    if (isLocalDevBuildInfo(baseline)) {
      deployWatch.value = 'local-skip'
      return
    }
    const fp = buildInfoFingerprint(baseline)
    deployWatch.value = 'polling'
    const started = Date.now()
    const maxMs = 30 * 60 * 1000
    deployPollTimer = setInterval(async () => {
      if (Date.now() - started > maxMs) {
        stopDeployWatch()
        deployWatch.value = 'timeout'
        return
      }
      const next = await fetchSiteBuildInfo()
      if (next && buildInfoFingerprint(next) !== fp) {
        stopDeployWatch()
        deployWatch.value = 'ready'
        siteBuildInfo.value = next
      }
    }, 5000)
  })()
}

function reloadPage() {
  window.location.reload()
}

const allPaths = computed(() => {
  const s = new Set([...Object.keys(flatEn.value), ...Object.keys(flatDe.value)])
  return [...s].sort()
})

const bilingualRows = computed(() =>
  allPaths.value.map((path) => ({
    path,
    en: flatEn.value[path] ?? '',
    de: flatDe.value[path] ?? '',
  }))
)

const rowsForSearch = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return bilingualRows.value
  return bilingualRows.value.filter(
    ({ path, en, de }) =>
      path.toLowerCase().includes(q) ||
      String(en).toLowerCase().includes(q) ||
      String(de).toLowerCase().includes(q)
  )
})

const navTree = computed(() => buildLocaleTreeFromBilingualRows(rowsForSearch.value))

/** Right pane: section headings (top-level key) + flat rows for scrolling alignment with the tree. */
const editorSections = computed(() => {
  const rows = rowsForSearch.value
  if (rows.length === 0) return []
  const out = []
  let lastTop = null
  for (const row of rows) {
    const top = row.path.split('.')[0] || row.path
    if (top !== lastTop) {
      lastTop = top
      out.push({ kind: 'heading', label: top })
    }
    out.push({ kind: 'row', path: row.path, en: row.en, de: row.de })
  }
  return out
})

const filterActive = computed(() => filter.value.trim().length > 0)

const draftEnCount = computed(() => {
  void draftTick.value
  return countLocaleDraftKeys('en')
})
const draftDeCount = computed(() => {
  void draftTick.value
  return countLocaleDraftKeys('de')
})

function hydrateFlatsFromBaseAndDrafts() {
  const d = loadAllLocaleDrafts()
  flatEn.value = {
    ...flattenLocaleStrings(deepCloneLocale(baseEn)),
    ...d.en,
  }
  flatDe.value = {
    ...flattenLocaleStrings(deepCloneLocale(baseDe)),
    ...d.de,
  }
  dirty.value = Object.keys(d.en).length > 0 || Object.keys(d.de).length > 0
}

function updateKey(path, locale, value) {
  dirty.value = true
  patchLocaleDraft(locale, path, value)
  draftTick.value++
  if (locale === 'en') {
    flatEn.value = { ...flatEn.value, [path]: value }
  } else {
    flatDe.value = { ...flatDe.value, [path]: value }
  }
}

function resetAllDrafts() {
  stopDeployWatch()
  deployWatch.value = null
  clearLocaleDraft('en')
  clearLocaleDraft('de')
  flatEn.value = flattenLocaleStrings(deepCloneLocale(baseEn))
  flatDe.value = flattenLocaleStrings(deepCloneLocale(baseDe))
  dirty.value = false
  draftTick.value++
  error.value = null
  prUrl.value = null
}

function scrollToPath(path) {
  const id = localePathDomId(path)
  nextTick(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

function queryParamString(v) {
  if (v == null) return ''
  if (Array.isArray(v)) return String(v[0] ?? '').trim()
  return String(v).trim()
}

function focusLocalePath(path, preferredLocale) {
  if (!path) return
  const esc =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(path)
      : path.replace(/"/g, '')
  const lang =
    preferredLocale === 'en' || preferredLocale === 'de' ? preferredLocale : null
  const run = () => {
    const root = editorRoot.value
    const scope = root && typeof root.querySelector === 'function' ? root : document
    let sel = `textarea[data-locale-path="${esc}"]`
    if (lang) sel += `[data-locale-lang="${lang}"]`
    let el = scope.querySelector(sel)
    if (!el) {
      el = scope.querySelector(`textarea[data-locale-path^="${esc}."]`)
    }
    el?.focus()
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  nextTick(() => {
    nextTick(run)
  })
}

function applyRouteQuery() {
  const q = route.query
  const loc = queryParamString(q.locale)
  const preferredLocale = loc === 'en' || loc === 'de' ? loc : null
  const key = queryParamString(q.key)
  if (key) {
    filter.value = key
    focusLocalePath(key, preferredLocale)
  }
}

function sectionKey(item, index) {
  return item.kind === 'heading' ? `h-${item.label}-${index}` : item.path
}

async function openPr() {
  error.value = null
  prUrl.value = null
  let messagesEn
  let messagesDe
  try {
    messagesEn = unflattenLocaleStrings({ ...flatEn.value })
    messagesDe = unflattenLocaleStrings({ ...flatDe.value })
  } catch (e) {
    error.value = String(e?.message || e)
    return
  }
  loading.value = true
  try {
    const res = await submitLocalesPullRequest({ en: messagesEn, de: messagesDe }, undefined)
    if (res?.pullRequestUrl) {
      prUrl.value = res.pullRequestUrl
      clearLocaleDraft('en')
      clearLocaleDraft('de')
      flatEn.value = flattenLocaleStrings(deepCloneLocale(baseEn))
      flatDe.value = flattenLocaleStrings(deepCloneLocale(baseDe))
      startDeployWatchAfterPr()
    }
    dirty.value = countLocaleDraftKeys('en') > 0 || countLocaleDraftKeys('de') > 0
    draftTick.value++
  } catch (e) {
    error.value = e.response?.data?.error || e.message || 'Request failed'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  hydrateFlatsFromBaseAndDrafts()
  applyRouteQuery()
  void refreshSiteBuild()
})

onUnmounted(() => {
  stopDeployWatch()
})

watch(
  () => [route.query.key, route.query.locale],
  () => applyRouteQuery()
)
</script>

<template>
  <div ref="editorRoot" class="admin-translations">
    <p class="admin-back">
      <RouterLink to="/dashboard">{{ t('admin.backToDashboard') }}</RouterLink>
    </p>
    <h1 class="admin-title">{{ t('admin.i18nEditorTitle') }}</h1>
    <p class="admin-lead">{{ t('admin.i18nEditorLead') }}</p>

    <p class="admin-github-hint">{{ t('admin.i18nEditorGithubPrHint') }}</p>

    <p v-if="siteBuildFetchDone && siteBuildInfo" class="admin-build-meta">
      <i class="bi bi-cpu me-1" aria-hidden="true" />
      {{ t('admin.i18nEditorSiteBuild', { info: formatBuildInfoShort(siteBuildInfo) }) }}
    </p>
    <p v-else-if="siteBuildFetchDone" class="admin-build-meta admin-build-meta--warn">
      {{ t('admin.i18nEditorSiteBuildUnknown') }}
    </p>

    <div v-if="deployWatch === 'polling'" class="admin-deploy-banner admin-deploy-banner--wait" role="status">
      <i class="bi bi-hourglass-split me-2" aria-hidden="true" />
      {{ t('admin.i18nEditorDeployWatching') }}
    </div>
    <div v-else-if="deployWatch === 'ready'" class="admin-deploy-banner admin-deploy-banner--ready">
      <p class="admin-deploy-banner-text">
        <i class="bi bi-check-circle me-2" aria-hidden="true" />
        {{ t('admin.i18nEditorDeployReady') }}
      </p>
      <button type="button" class="admin-deploy-reload" @click="reloadPage">
        {{ t('admin.i18nEditorReloadPage') }}
      </button>
    </div>
    <div v-else-if="deployWatch === 'timeout'" class="admin-deploy-banner admin-deploy-banner--warn" role="alert">
      {{ t('admin.i18nEditorDeployTimeout') }}
    </div>
    <div v-else-if="deployWatch === 'local-skip'" class="admin-deploy-banner admin-deploy-banner--warn">
      {{ t('admin.i18nEditorDeployLocalSkip') }}
    </div>

    <p v-if="draftEnCount > 0 || draftDeCount > 0" class="admin-draft-hint">
      {{ t('admin.i18nEditorDraftHint', { en: draftEnCount, de: draftDeCount }) }}
    </p>

    <div class="admin-toolbar">
      <label class="admin-filter">
        <span>{{ t('admin.i18nEditorFilter') }}</span>
        <input v-model="filter" type="search" class="admin-input" autocomplete="off" />
      </label>
    </div>

    <div class="admin-actions">
      <button type="button" class="admin-btn-secondary" :disabled="loading" @click="resetAllDrafts">
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

    <!-- Search: flat table, full width -->
    <div v-if="filterActive" class="admin-table-wrap admin-table-wrap--full">
      <p v-if="rowsForSearch.length > 0" class="admin-filter-mode-hint">
        {{ t('admin.i18nEditorFilterFlatHint') }}
      </p>
      <div class="admin-locale-header admin-locale-header--tri">
        <span class="admin-locale-header-key">{{ t('admin.i18nEditorColKey') }}</span>
        <span>{{ t('admin.i18nEditorColEn') }}</span>
        <span>{{ t('admin.i18nEditorColDe') }}</span>
      </div>
      <p v-if="rowsForSearch.length === 0" class="admin-locale-empty">{{ t('admin.i18nEditorNoKeys') }}</p>
      <table v-else class="admin-locale-table admin-locale-table--tri">
        <tbody>
          <tr v-for="row in rowsForSearch" :key="row.path" :id="localePathDomId(row.path)">
            <td class="locale-key">{{ row.path }}</td>
            <td>
              <textarea
                class="admin-input locale-val"
                rows="2"
                :data-locale-path="row.path"
                data-locale-lang="en"
                :value="row.en"
                @input="updateKey(row.path, 'en', $event.target.value)"
              />
            </td>
            <td>
              <textarea
                class="admin-input locale-val"
                rows="2"
                :data-locale-path="row.path"
                data-locale-lang="de"
                :value="row.de"
                @input="updateKey(row.path, 'de', $event.target.value)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Browse: collapsibles left, inputs right -->
    <div v-else class="admin-editor-split">
      <aside class="admin-nav-pane" aria-label="Translation key navigation">
        <p class="admin-nav-hint">{{ t('admin.i18nEditorNavHint') }}</p>
        <p v-if="rowsForSearch.length === 0" class="admin-locale-empty">{{ t('admin.i18nEditorNoKeys') }}</p>
        <AdminLocaleNavNode v-else :node="navTree" path-prefix="" @scroll-to-path="scrollToPath" />
      </aside>

      <div class="admin-edit-pane">
        <div class="admin-locale-header admin-locale-header--tri">
          <span class="admin-locale-header-key">{{ t('admin.i18nEditorColKey') }}</span>
          <span>{{ t('admin.i18nEditorColEn') }}</span>
          <span>{{ t('admin.i18nEditorColDe') }}</span>
        </div>
        <div class="admin-edit-pane-body">
          <p v-if="rowsForSearch.length === 0" class="admin-locale-empty">{{ t('admin.i18nEditorNoKeys') }}</p>
          <div v-else class="admin-edit-rows">
            <template v-for="(item, index) in editorSections" :key="sectionKey(item, index)">
              <h3 v-if="item.kind === 'heading'" class="admin-edit-section">{{ item.label }}</h3>
              <div v-else class="admin-edit-row" :id="localePathDomId(item.path)">
                <div class="admin-edit-row-key">{{ item.path }}</div>
                <div class="admin-edit-row-fields">
                  <div class="locale-lang-block">
                    <span class="locale-lang-label">EN</span>
                    <textarea
                      class="admin-input locale-val"
                      rows="2"
                      :data-locale-path="item.path"
                      data-locale-lang="en"
                      :value="item.en"
                      @input="updateKey(item.path, 'en', $event.target.value)"
                    />
                  </div>
                  <div class="locale-lang-block">
                    <span class="locale-lang-label">DE</span>
                    <textarea
                      class="admin-input locale-val"
                      rows="2"
                      :data-locale-path="item.path"
                      data-locale-lang="de"
                      :value="item.de"
                      @input="updateKey(item.path, 'de', $event.target.value)"
                    />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-translations {
  max-width: 1400px;
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
.admin-build-meta {
  font-size: var(--text-sm, 0.8125rem);
  color: var(--color-text-muted, #495057);
  margin: 0 0 0.75rem;
  padding: 0.4rem 0.55rem;
  background: var(--color-surface-alt, #f1f3f5);
  border-radius: 0.35rem;
  border: 1px solid var(--color-border, #e9ecef);
  line-height: 1.4;
}
.admin-build-meta--warn {
  color: var(--bs-warning-text-emphasis, #997404);
  background: var(--bs-warning-bg-subtle, #fff3cd);
  border-color: var(--bs-warning-border-subtle, #ffecb5);
}
.admin-deploy-banner {
  margin: 0 0 1rem;
  padding: 0.55rem 0.75rem;
  border-radius: 0.375rem;
  font-size: var(--text-sm, 0.875rem);
  line-height: 1.45;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.admin-deploy-banner--wait {
  background: var(--bs-info-bg-subtle, #cff4fc);
  border: 1px solid var(--bs-info-border-subtle, #9eeaf9);
  color: var(--bs-info-text-emphasis, #055160);
}
.admin-deploy-banner--ready {
  background: var(--bs-success-bg-subtle, #d1e7dd);
  border: 1px solid var(--bs-success-border-subtle, #a3cfbb);
  color: var(--bs-success-text-emphasis, #0a3622);
  flex-direction: column;
  align-items: stretch;
}
.admin-deploy-banner--warn {
  background: var(--bs-warning-bg-subtle, #fff3cd);
  border: 1px solid var(--bs-warning-border-subtle, #ffecb5);
  color: var(--bs-warning-text-emphasis, #997404);
}
.admin-deploy-banner-text {
  margin: 0;
  display: flex;
  align-items: center;
}
.admin-deploy-reload {
  align-self: flex-start;
  padding: 0.35rem 0.75rem;
  font-weight: 600;
  border-radius: 0.35rem;
  border: none;
  cursor: pointer;
  background: var(--bs-success, #198754);
  color: #fff;
}
.admin-deploy-reload:hover {
  filter: brightness(1.05);
}
.admin-draft-hint {
  font-size: var(--text-sm, 0.875rem);
  color: var(--bs-info-text-emphasis, #055160);
  background: var(--bs-info-bg-subtle, #cff4fc);
  border: 1px solid var(--bs-info-border-subtle, #9eeaf9);
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  margin: 0 0 1rem;
  line-height: 1.45;
}
.admin-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
  margin-bottom: 1rem;
}
.admin-filter {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 200px;
  flex: 1;
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
.admin-editor-split {
  display: grid;
  grid-template-columns: minmax(240px, 28%) 1fr;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 900px) {
  .admin-editor-split {
    grid-template-columns: 1fr;
  }
}
.admin-nav-pane {
  position: sticky;
  top: 0.75rem;
  max-height: min(78vh, 820px);
  overflow: auto;
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: var(--radius, 0.375rem);
  padding: 0.65rem 0.75rem 0.85rem;
  background: var(--color-surface-alt, #f8f9fa);
}
.admin-nav-hint {
  margin: 0 0 0.65rem;
  font-size: 0.75rem;
  color: var(--color-text-muted, #6c757d);
  line-height: 1.4;
}
.admin-edit-pane {
  min-width: 0;
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: var(--radius, 0.375rem);
  display: flex;
  flex-direction: column;
  max-height: min(78vh, 820px);
}
.admin-edit-pane-body {
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.admin-edit-rows {
  padding: 0.5rem 0.65rem 0.85rem;
}
.admin-edit-section {
  margin: 0.75rem 0 0.4rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-muted, #495057);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  position: sticky;
  top: 0;
  z-index: 1;
  background: linear-gradient(to bottom, var(--color-bg, #fff) 70%, transparent);
  padding: 0.25rem 0;
  scroll-margin-top: 2rem;
}
.admin-edit-section:first-child {
  margin-top: 0;
}
.admin-edit-row {
  display: grid;
  grid-template-columns: minmax(140px, 22%) 1fr;
  gap: 0.65rem;
  align-items: start;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border, #e9ecef);
  scroll-margin-top: 0.75rem;
}
.admin-edit-row:last-child {
  border-bottom: none;
}
.admin-edit-row-key {
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  word-break: break-word;
  line-height: 1.35;
  color: var(--color-text-muted, #495057);
  padding-top: 0.35rem;
}
.admin-edit-row-fields {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-width: 0;
}
.locale-lang-block {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}
.locale-lang-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted, #6c757d);
}
.admin-table-wrap {
  overflow: auto;
  max-height: min(70vh, 720px);
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: var(--radius, 0.375rem);
}
.admin-table-wrap--full {
  margin-top: 0.5rem;
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
.admin-locale-header--tri {
  grid-template-columns: minmax(120px, 22%) 1fr 1fr;
}
.admin-locale-header-key {
  min-width: 0;
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
.admin-locale-table--tri td:first-child {
  width: 22%;
  min-width: 140px;
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
