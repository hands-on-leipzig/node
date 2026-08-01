<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { listAdminCoaches } from '@/services/draht'
import { buildViewAsCoachUrl } from '@/utils/coachImpersonation'

const { t } = useI18n()

const search = ref('')
const loading = ref(false)
const error = ref('')
const coaches = ref([])
const selectedId = ref(null)

let searchTimer = null

function coachLabel(c) {
  const label = String(c?.label || '').trim()
  if (label) return label
  const name = [c?.firstname, c?.lastname].filter(Boolean).join(' ').trim()
  if (name) return name
  return String(c?.email || `#${c?.coachContactId}`)
}

function coachMeta(c) {
  const email = String(c?.email || '').trim()
  const id = c?.coachContactId
  if (email && id) return `${email} · ID ${id}`
  if (email) return email
  return id ? `ID ${id}` : ''
}

async function runSearch() {
  loading.value = true
  error.value = ''
  try {
    const res = await listAdminCoaches(search.value.trim(), 25)
    const rows = res?.data?.data
    coaches.value = Array.isArray(rows) ? rows : []
    if (selectedId.value != null && !coaches.value.some((c) => c.coachContactId === selectedId.value)) {
      selectedId.value = null
    }
  } catch (e) {
    coaches.value = []
    error.value = e.response?.data?.message || e.message || t('admin.viewAsCoachLoadFailed')
  } finally {
    loading.value = false
  }
}

watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void runSearch()
  }, 280)
})

function selectCoach(c) {
  selectedId.value = c?.coachContactId ?? null
}

function openViewAsTab() {
  const id = selectedId.value
  if (!id) return
  const picked = coaches.value.find((c) => c.coachContactId === id)
  const label = picked ? coachLabel(picked) : ''
  window.open(buildViewAsCoachUrl(id, label), '_blank', 'noopener,noreferrer')
}

void runSearch()
</script>

<template>
  <div class="view-as-coach-panel">
    <span class="glass-sidebar-footer__menu-label"><I18nText k="admin.viewAsCoachTitle" /></span>
    <p class="view-as-coach-lead"><I18nText k="admin.viewAsCoachLead" /></p>
    <input
      v-model="search"
      type="search"
      class="view-as-coach-search"
      :placeholder="t('admin.viewAsCoachSearchPlaceholder')"
      autocomplete="off"
    />
    <div v-if="loading" class="view-as-coach-status">
      <i class="bi bi-arrow-repeat spin" aria-hidden="true"></i>
      <I18nText k="admin.viewAsCoachLoading" />
    </div>
    <p v-else-if="error" class="view-as-coach-error">{{ error }}</p>
    <ul v-else class="view-as-coach-list" role="listbox" :aria-label="t('admin.viewAsCoachTitle')">
      <li v-if="coaches.length === 0" class="view-as-coach-empty">
        <I18nText k="admin.viewAsCoachEmpty" />
      </li>
      <li v-for="c in coaches" :key="c.coachContactId">
        <button
          type="button"
          class="view-as-coach-option"
          :class="{ active: selectedId === c.coachContactId }"
          role="option"
          :aria-selected="selectedId === c.coachContactId"
          @click="selectCoach(c)"
        >
          <span class="view-as-coach-option-name">{{ coachLabel(c) }}</span>
          <span class="view-as-coach-option-meta">{{ coachMeta(c) }}</span>
        </button>
      </li>
    </ul>
    <button
      type="button"
      class="view-as-coach-open"
      :disabled="!selectedId"
      @click="openViewAsTab"
    >
      <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
      <I18nText k="admin.viewAsCoachOpenTab" />
    </button>
  </div>
</template>

<style scoped>
.view-as-coach-panel {
  padding: 0.65rem 1rem 0.85rem;
  border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--liquid-bg-deep) 90%, var(--color-bg-muted));
}

.view-as-coach-panel :deep(.glass-sidebar-footer__menu-label) {
  color: var(--color-text-muted);
}

.view-as-coach-lead {
  margin: 0.25rem 0 0.55rem;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--color-text-muted);
}

.view-as-coach-search {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.6rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--liquid-tile-bg-inner);
  color: var(--color-text);
  font-size: 0.85rem;
  font-family: inherit;
}

.view-as-coach-search::placeholder {
  color: var(--color-text-subtle);
}

.view-as-coach-search:focus {
  outline: 2px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
  outline-offset: 1px;
  border-color: var(--color-accent);
}

.view-as-coach-list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  max-height: 11rem;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--liquid-tile-bg-inner);
}

.view-as-coach-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.12rem;
  width: 100%;
  padding: 0.5rem 0.6rem;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
  border-radius: 0;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.view-as-coach-option:last-child {
  border-bottom: none;
}

.view-as-coach-option:hover,
.view-as-coach-option.active {
  background: color-mix(in srgb, var(--color-accent) 14%, var(--liquid-tile-bg-inner));
}

.view-as-coach-option-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
}

.view-as-coach-option-meta {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.view-as-coach-empty,
.view-as-coach-status,
.view-as-coach-error {
  margin: 0.45rem 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.view-as-coach-error {
  color: var(--color-danger, #c0392b);
}

.view-as-coach-open {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.6rem;
  width: 100%;
  justify-content: center;
  padding: 0.5rem 0.65rem;
  border: none;
  border-radius: var(--radius);
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.view-as-coach-open:hover:not(:disabled) {
  filter: brightness(1.05);
}

.view-as-coach-open:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.spin {
  animation: view-as-spin 0.9s linear infinite;
}

@keyframes view-as-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
