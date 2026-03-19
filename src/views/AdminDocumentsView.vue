<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getDocumentsConfig,
  putDocumentsConfig,
  getDocumentsGraphStatus,
  postDocumentsProbeFolder,
} from '@/services/draht'

const { t } = useI18n()

const folderUrl = ref('')
const title = ref('')
const skipGraphFileListing = ref(false)
/** @type {import('vue').Ref<Array<{ name: string, url: string }>>} */
const files = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref(null)
const success = ref(false)

const graphStatusLoading = ref(false)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const graphStatus = ref(null)
const probeLoading = ref(false)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const probeResult = ref(null)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const saveProbe = ref(null)

const graphOrProbeHas403 = computed(() => {
  const g = graphStatus.value
  if (g && !g.error && Number(g.graphSitesRootHttp) === 403) return true
  const p = probeResult.value
  if (!p || p.error) return false
  const codes = [
    p.shareListHttp,
    p.shareDriveItemHttp,
    p.spoSiteHttp,
    p.spoChildrenHttp,
  ]
  return codes.some((c) => Number(c) === 403)
})

function unwrapApiData(data) {
  if (!data || typeof data !== 'object') return data
  const inner = data.data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner
  return data
}

function emptyRow() {
  return { name: '', url: '' }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await getDocumentsConfig()
    const raw = res?.data
    const j =
      raw?.data && typeof raw.data === 'object' && ('folderUrl' in raw.data || 'files' in raw.data)
        ? raw.data
        : raw
    folderUrl.value = j?.folderUrl || ''
    title.value = j?.title || ''
    skipGraphFileListing.value = !!j?.skipGraphFileListing
    const list = Array.isArray(j?.files) ? j.files : []
    files.value =
      list.length > 0
        ? list.map((r) => ({
            name: String(r?.name ?? '').trim(),
            url: String(r?.url ?? '').trim(),
          }))
        : [emptyRow()]
  } catch (e) {
    error.value =
      e.response?.status === 403
        ? t('admin.documentsForbidden')
        : t('admin.documentsLoadFailed')
    files.value = [emptyRow()]
  } finally {
    loading.value = false
  }
}

function addFileRow() {
  files.value.push(emptyRow())
}

function removeFileRow(index) {
  if (files.value.length <= 1) {
    files.value = [emptyRow()]
    return
  }
  files.value.splice(index, 1)
}

function payloadFiles() {
  return files.value
    .map((r) => ({
      name: r.name.trim(),
      url: r.url.trim(),
    }))
    .filter((r) => r.url && /^https?:\/\//i.test(r.url))
}

async function runGraphStatus() {
  graphStatusLoading.value = true
  graphStatus.value = null
  error.value = null
  try {
    const res = await getDocumentsGraphStatus()
    graphStatus.value = unwrapApiData(res?.data) ?? null
  } catch (e) {
    graphStatus.value = {
      error: true,
      message: e.response?.data?.message || e.response?.data?.error || String(e.message),
    }
  } finally {
    graphStatusLoading.value = false
  }
}

function graphProbeMessage(probe) {
  const k = probe?.summaryKey || 'unknown'
  return t('admin.graphProbe.' + k, probe || {})
}

/** @param {Record<string, unknown> | null | undefined} row */
function graphAccessModeLabel(row) {
  if (row?.graphAccessMode === 'client_credentials') {
    return t('admin.documentsGraphModeClientCredentials')
  }
  return row?.graphAccessMode != null ? String(row.graphAccessMode) : '—'
}

/** @param {Record<string, unknown> | null | undefined} row */
function graphAccessActorLabel(row) {
  if (row?.graphAccessActor === 'microsoft_entra_application') {
    return t('admin.documentsGraphActorApplication')
  }
  return row?.graphAccessActor != null ? String(row.graphAccessActor) : '—'
}

/** @param {Record<string, unknown> | null | undefined} row */
function formatGraphTokenRoles(row) {
  const r = row?.graphTokenRoles
  if (!Array.isArray(r) || r.length === 0) return ''
  return r.join(', ')
}

function saveProbeSkipMessage(reason) {
  return t('admin.graphProbe.skip_' + (reason || 'unknown'))
}

async function runProbeFolder() {
  const url = folderUrl.value.trim()
  if (!url) {
    probeResult.value = { summaryKey: 'no_url_entered' }
    return
  }
  probeLoading.value = true
  probeResult.value = null
  error.value = null
  try {
    const res = await postDocumentsProbeFolder(url)
    probeResult.value = unwrapApiData(res?.data) ?? null
  } catch (e) {
    probeResult.value = {
      error: true,
      message: e.response?.data?.message || e.response?.data?.error || String(e.message),
    }
  } finally {
    probeLoading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = null
  success.value = false
  try {
    const res = await putDocumentsConfig({
      folderUrl: folderUrl.value.trim(),
      title: title.value.trim(),
      files: payloadFiles(),
      skipGraphFileListing: skipGraphFileListing.value,
    })
    const raw = res?.data
    const j =
      raw?.data && typeof raw.data === 'object' && ('folderUrl' in raw.data || 'files' in raw.data)
        ? raw.data
        : raw
    folderUrl.value = j?.folderUrl || ''
    title.value = j?.title || ''
    skipGraphFileListing.value = !!j?.skipGraphFileListing
    const list = Array.isArray(j?.files) ? j.files : []
    files.value =
      list.length > 0
        ? list.map((r) => ({
            name: String(r?.name ?? '').trim(),
            url: String(r?.url ?? '').trim(),
          }))
        : [emptyRow()]
    success.value = true
    saveProbe.value =
      j?.folderGraphProbe && typeof j.folderGraphProbe === 'object' ? { ...j.folderGraphProbe } : null
    setTimeout(() => {
      success.value = false
    }, 8000)
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error
    error.value =
      e.response?.status === 403
        ? t('admin.documentsForbidden')
        : msg || t('admin.documentsSaveFailed')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-documents">
    <header class="admin-documents-head">
      <RouterLink to="/dashboard" class="admin-back">
        <i class="bi bi-arrow-left"></i> <I18nText k="admin.backToDashboard" />
      </RouterLink>
      <h1><I18nText k="admin.documentsTitle" /></h1>
      <p class="admin-lead"><I18nText k="admin.documentsLead" /></p>
    </header>

    <div v-if="loading" class="admin-loading">
      <i class="bi bi-arrow-repeat spin"></i> <I18nText k="dashboard.loading" />
    </div>
    <form v-else class="admin-form" @submit.prevent="save">
      <fieldset class="admin-fieldset">
        <legend><I18nText k="admin.documentsFilesSection" /></legend>
        <p class="admin-hint admin-hint-block"><I18nText k="admin.documentsFilesHint" /></p>
        <div class="admin-files-head">
          <span class="admin-files-col-name"><I18nText k="admin.documentsFileName" /></span>
          <span class="admin-files-col-url"><I18nText k="admin.documentsFileUrl" /></span>
          <span class="admin-files-col-act" aria-hidden="true" />
        </div>
        <div v-for="(row, idx) in files" :key="idx" class="admin-file-row">
          <input
            v-model="row.name"
            type="text"
            class="admin-input admin-input-name"
            :placeholder="t('admin.documentsFileNamePlaceholder')"
            autocomplete="off"
          />
          <input
            v-model="row.url"
            type="url"
            class="admin-input admin-input-url"
            :placeholder="t('admin.documentsFileUrlPlaceholder')"
            autocomplete="off"
          />
          <button
            type="button"
            class="admin-remove-file"
            :title="t('admin.documentsRemoveFile')"
            @click="removeFileRow(idx)"
          >
            <i class="bi bi-trash"></i>
          </button>
        </div>
        <button type="button" class="admin-add-file" @click="addFileRow">
          <i class="bi bi-plus-lg"></i> <I18nText k="admin.documentsAddFile" />
        </button>
      </fieldset>

      <label class="admin-label">
        <span><I18nText k="admin.documentsFolderUrl" /></span>
        <input
          v-model="folderUrl"
          type="url"
          class="admin-input"
          :placeholder="t('admin.documentsFolderPlaceholder')"
          autocomplete="off"
        />
      </label>
      <p class="admin-hint"><I18nText k="admin.documentsFolderHint" /></p>

      <fieldset class="admin-fieldset admin-graph-fieldset">
        <legend><I18nText k="admin.documentsGraphDebugTitle" /></legend>
        <p class="admin-hint admin-hint-block"><I18nText k="admin.documentsGraphDebugLead" /></p>
        <div class="admin-graph-actions">
          <button
            type="button"
            class="admin-btn-secondary"
            :disabled="graphStatusLoading"
            @click="runGraphStatus"
          >
            <i v-if="graphStatusLoading" class="bi bi-arrow-repeat spin"></i>
            <I18nText k="admin.documentsGraphTestConnection" />
          </button>
          <button
            type="button"
            class="admin-btn-secondary"
            :disabled="probeLoading || skipGraphFileListing"
            @click="runProbeFolder"
          >
            <i v-if="probeLoading" class="bi bi-arrow-repeat spin"></i>
            <I18nText k="admin.documentsProbeFolder" />
          </button>
        </div>
        <div v-if="graphStatus" class="admin-graph-box">
          <template v-if="graphStatus.error">
            <p class="admin-graph-err">{{ graphStatus.message }}</p>
          </template>
          <template v-else>
            <ul class="admin-graph-list">
              <li>
                <span class="admin-graph-k">MS_CLIENT_ID</span>
                {{ graphStatus.msClientIdConfigured ? '✓' : '—' }}
              </li>
              <li>
                <span class="admin-graph-k">MS_TENANT_ID</span>
                {{ graphStatus.msTenantConfigured ? '✓' : '—' }}
              </li>
              <li>
                <span class="admin-graph-k">MS_CLIENT_SECRET</span>
                {{ graphStatus.msClientSecretConfigured ? '✓' : '—' }}
              </li>
              <li v-if="graphStatus.handsonGraphDisabled">
                <span class="admin-graph-warn"><I18nText k="admin.documentsGraphDisabledGlobal" /></span>
              </li>
              <li>
                <span class="admin-graph-k"><I18nText k="admin.documentsGraphToken" /></span>
                {{ graphStatus.tokenRequestOk ? '✓ OK' : '✗' }}
                <span v-if="graphStatus.tokenError" class="admin-graph-err small">{{ graphStatus.tokenError }}</span>
              </li>
              <li v-if="graphStatus.tokenRequestOk">
                <span class="admin-graph-k">GET /sites/root</span>
                HTTP {{ graphStatus.graphSitesRootHttp }}
                {{ graphStatus.graphSitesRootOk ? '✓' : '✗' }}
                <span v-if="graphStatus.graphSitesRootHint" class="admin-graph-hint small">{{
                  graphStatus.graphSitesRootHint
                }}</span>
              </li>
            </ul>
            <div v-if="graphStatus.graphAccessMode" class="admin-graph-identity">
              <p class="admin-hint admin-hint-block">
                <strong><I18nText k="admin.documentsGraphIdentityTitle" /></strong>
                — <I18nText k="admin.documentsGraphIdentityExplainer" />
              </p>
              <ul class="admin-graph-list small">
                <li>
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldMode" /></span>
                  {{ graphAccessModeLabel(graphStatus) }}
                </li>
                <li>
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldActor" /></span>
                  {{ graphAccessActorLabel(graphStatus) }}
                </li>
                <li v-if="graphStatus.msTenantId">
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldTenantConfigured" /></span>
                  {{ graphStatus.msTenantId }}
                </li>
                <li v-if="graphStatus.msApplicationClientIdConfigured">
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldClientConfigured" /></span>
                  {{ graphStatus.msApplicationClientIdConfigured }}
                </li>
                <li v-if="graphStatus.graphTokenApplicationId">
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldTokenAppId" /></span>
                  {{ graphStatus.graphTokenApplicationId }}
                </li>
                <li v-if="graphStatus.graphTokenTenantId">
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldTokenTenantId" /></span>
                  {{ graphStatus.graphTokenTenantId }}
                </li>
                <li v-if="graphStatus.graphTokenAudience">
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldTokenAudience" /></span>
                  {{ graphStatus.graphTokenAudience }}
                </li>
                <li v-if="formatGraphTokenRoles(graphStatus)">
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldTokenRoles" /></span>
                  {{ formatGraphTokenRoles(graphStatus) }}
                </li>
              </ul>
            </div>
          </template>
        </div>
        <div v-if="probeResult" class="admin-graph-box">
          <strong><I18nText k="admin.documentsProbeResult" /></strong>
          <p v-if="probeResult.error" class="admin-graph-err">{{ probeResult.message }}</p>
          <template v-else>
            <p :class="probeResult.readable ? 'admin-graph-ok' : 'admin-graph-warn'">
              {{ graphProbeMessage(probeResult) }}
            </p>
            <div v-if="probeResult.graphAccessMode" class="admin-graph-identity">
              <p class="admin-hint admin-hint-block small">
                <strong><I18nText k="admin.documentsGraphIdentityTitle" /></strong>
                — <I18nText k="admin.documentsGraphIdentityExplainerShort" />
              </p>
              <ul class="admin-graph-list small">
                <li>
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldMode" /></span>
                  {{ graphAccessModeLabel(probeResult) }}
                </li>
                <li>
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldActor" /></span>
                  {{ graphAccessActorLabel(probeResult) }}
                </li>
                <li v-if="probeResult.msTenantId">
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldTenantConfigured" /></span>
                  {{ probeResult.msTenantId }}
                </li>
                <li v-if="probeResult.msApplicationClientIdConfigured">
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldClientConfigured" /></span>
                  {{ probeResult.msApplicationClientIdConfigured }}
                </li>
                <li v-if="probeResult.graphTokenApplicationId">
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldTokenAppId" /></span>
                  {{ probeResult.graphTokenApplicationId }}
                </li>
                <li v-if="formatGraphTokenRoles(probeResult)">
                  <span class="admin-graph-k"><I18nText k="admin.documentsGraphFieldTokenRoles" /></span>
                  {{ formatGraphTokenRoles(probeResult) }}
                </li>
              </ul>
            </div>
            <ul v-if="probeResult.tokenOk" class="admin-graph-list small">
              <li v-if="probeResult.shareListHttp != null">
                Sharing-API HTTP: {{ probeResult.shareListHttp }}
              </li>
              <li v-if="probeResult.shareDriveItemHttp != null">
                <I18nText k="admin.documentsProbeShareDriveItemHttp" />: {{ probeResult.shareDriveItemHttp }}
              </li>
              <li v-if="probeResult.spoSiteHttp != null">Site-API HTTP: {{ probeResult.spoSiteHttp }}</li>
              <li v-if="probeResult.spoChildrenHttp != null">
                Ordner-Liste HTTP: {{ probeResult.spoChildrenHttp }}
              </li>
              <li v-if="probeResult.via"><I18nText k="admin.documentsProbeVia" />: {{ probeResult.via }}</li>
              <li v-if="probeResult.fileCount != null">
                <I18nText k="admin.documentsProbeFileCount" />: {{ probeResult.fileCount }}
              </li>
            </ul>
            <pre v-if="probeResult.graphErrorSnippet" class="admin-graph-pre">{{ probeResult.graphErrorSnippet }}</pre>
          </template>
        </div>
        <p v-if="graphOrProbeHas403" class="admin-hint admin-hint-block admin-graph-403-hint">
          <I18nText k="admin.documentsGraph403Hint" />
        </p>
      </fieldset>

      <label class="admin-check">
        <input v-model="skipGraphFileListing" type="checkbox" />
        <span><I18nText k="admin.documentsSkipGraph" /></span>
      </label>
      <p class="admin-hint"><I18nText k="admin.documentsSkipGraphHint" /></p>

      <label class="admin-label">
        <span><I18nText k="admin.documentsCardTitle" /></span>
        <input
          v-model="title"
          type="text"
          class="admin-input"
          :placeholder="t('admin.documentsCardTitlePlaceholder')"
        />
      </label>
      <p class="admin-hint"><I18nText k="admin.documentsTitleHint" /></p>

      <p v-if="error" class="admin-error"><i class="bi bi-exclamation-circle"></i> {{ error }}</p>
      <p v-if="success" class="admin-success"><i class="bi bi-check-circle"></i> <I18nText k="admin.documentsSaved" /></p>

      <div v-if="saveProbe" class="admin-save-probe">
        <strong><I18nText k="admin.documentsSaveProbeTitle" /></strong>
        <template v-if="saveProbe.skipped">
          <p class="admin-hint">{{ saveProbeSkipMessage(saveProbe.reason) }}</p>
        </template>
        <template v-else>
          <p :class="saveProbe.readable ? 'admin-graph-ok' : 'admin-graph-warn'">
            {{ graphProbeMessage(saveProbe) }}
          </p>
          <ul v-if="saveProbe.tokenOk" class="admin-graph-list small">
            <li v-if="saveProbe.shareListHttp != null">Sharing-API: {{ saveProbe.shareListHttp }}</li>
            <li v-if="saveProbe.spoChildrenHttp != null">Ordner-API: {{ saveProbe.spoChildrenHttp }}</li>
          </ul>
          <pre v-if="saveProbe.graphErrorSnippet" class="admin-graph-pre">{{ saveProbe.graphErrorSnippet }}</pre>
        </template>
      </div>

      <button type="submit" class="admin-save" :disabled="saving">
        <i v-if="saving" class="bi bi-arrow-repeat spin"></i>
        <template v-if="saving"><I18nText k="common.save" />…</template>
        <I18nText v-else k="admin.documentsSave" />
      </button>
    </form>
  </div>
</template>

<style scoped>
.admin-documents {
  max-width: 52rem;
  margin: 0 auto;
  padding-bottom: 2rem;
}
.admin-documents-head {
  margin-bottom: 1.5rem;
}
.admin-back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--text-sm);
  color: var(--color-accent);
  text-decoration: none;
  margin-bottom: 0.75rem;
}
.admin-back:hover {
  text-decoration: underline;
}
.admin-documents h1 {
  font-size: 1.5rem;
  margin: 0 0 0.5rem;
}
.admin-lead {
  color: var(--color-text-muted);
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.5;
}
.admin-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-muted);
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.admin-form {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.admin-fieldset {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 1rem 1rem 0.75rem;
  margin: 0 0 1rem;
}
.admin-fieldset legend {
  font-size: var(--text-sm);
  font-weight: 600;
  padding: 0 0.35rem;
}
.admin-hint-block {
  margin-top: 0;
  margin-bottom: 0.75rem;
}
.admin-files-head {
  display: grid;
  grid-template-columns: 1fr 2fr 2.25rem;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: 0.35rem;
}
@media (max-width: 640px) {
  .admin-files-head {
    display: none;
  }
  .admin-file-row {
    grid-template-columns: 1fr 2.25rem;
  }
  .admin-input-name {
    grid-column: 1 / -1;
  }
}
.admin-file-row {
  display: grid;
  grid-template-columns: 1fr 2fr 2.25rem;
  gap: 0.5rem;
  align-items: start;
  margin-bottom: 0.5rem;
}
.admin-input-name,
.admin-input-url {
  width: 100%;
  min-width: 0;
}
.admin-remove-file {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text-muted);
  cursor: pointer;
  line-height: 1;
}
.admin-remove-file:hover {
  color: var(--color-error, #dc2626);
  border-color: var(--color-error, #dc2626);
}
.admin-add-file {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.25rem 0 1rem;
  padding: 0.4rem 0.75rem;
  font-size: var(--text-sm);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
}
.admin-add-file:hover {
  border-style: solid;
}
.admin-check {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 0.75rem;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.admin-check input {
  margin-top: 0.2rem;
}
.admin-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  margin-top: 0.75rem;
}
.admin-input {
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--text-base);
}
.admin-input:focus {
  outline: none;
  border-color: var(--color-accent);
}
.admin-hint {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin: 0 0 0.5rem;
  line-height: 1.4;
}
.admin-error {
  color: var(--color-error, #dc2626);
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.admin-success {
  color: #16a34a;
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.admin-save {
  margin-top: 1rem;
  align-self: flex-start;
  padding: 0.55rem 1.25rem;
  font-weight: 600;
  border: none;
  border-radius: var(--radius);
  background: var(--color-accent);
  color: white;
  cursor: pointer;
}
.admin-save:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.admin-graph-fieldset {
  margin-top: 1rem;
}
.admin-graph-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.admin-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.85rem;
  font-size: var(--text-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-muted);
  color: var(--color-text);
  cursor: pointer;
}
.admin-btn-secondary:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.admin-btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.admin-graph-identity {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--bs-border-color, #dee2e6);
}

.admin-graph-box {
  font-size: var(--text-sm);
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  border-radius: var(--radius);
  background: var(--color-bg-muted);
  border: 1px solid var(--color-border);
}
.admin-graph-list {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
  line-height: 1.5;
}
.admin-graph-list.small {
  font-size: 0.8rem;
}
.admin-graph-k {
  font-weight: 600;
  margin-right: 0.35rem;
}
.admin-graph-ok {
  color: #15803d;
  margin: 0.35rem 0 0;
}
.admin-graph-warn {
  color: #b45309;
}
.admin-graph-err {
  color: var(--color-error, #dc2626);
  margin: 0.25rem 0 0;
}
.admin-graph-err.small,
.admin-graph-hint.small {
  display: block;
  font-size: 0.8rem;
  margin-top: 0.25rem;
}
.admin-graph-pre {
  font-size: 0.7rem;
  overflow: auto;
  max-height: 6rem;
  margin: 0.5rem 0 0;
  padding: 0.35rem;
  background: var(--color-bg);
  border-radius: 4px;
}
.admin-save-probe {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg-muted);
}
.admin-save-probe strong {
  display: block;
  margin-bottom: 0.35rem;
}
</style>
