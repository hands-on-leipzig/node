<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getGroup } from '@/services/draht'
import TeklaTimeline from '@/components/TeklaTimeline.vue'

const route = useRoute()
const { t, locale } = useI18n()
const group = ref(null)
const loading = ref(true)
const error = ref(null)

const id = computed(() => route.params.id)

const timelineSteps = computed(() => {
  const tl = group.value?.timeline
  if (!tl) return []
  return Array.isArray(tl.timeline) ? tl.timeline : (Array.isArray(tl) ? tl : [])
})

function formatAddress(addr) {
  if (!addr) return ''
  const parts = [
    addr.name,
    [addr.street, addr.number].filter(Boolean).join(' '),
    addr.line2,
    addr.line3,
    [addr.zip, addr.town].filter(Boolean).join(' '),
    addr.country,
  ].filter(Boolean)
  return parts.join(', ')
}

async function fetchGroup() {
  if (!id.value) return
  loading.value = true
  error.value = null
  group.value = null
  try {
    const res = await getGroup(id.value)
    group.value = res.data
  } catch (e) {
    error.value = e.response?.status === 404 ? t('detail.notFound') : (e.message || t('errors.loadFailed'))
  } finally {
    loading.value = false
  }
}

onMounted(fetchGroup)
watch(id, fetchGroup)
</script>

<template>
  <div class="detail-view">
    <div v-if="loading" class="detail-loading">
      <i class="bi bi-arrow-repeat spin"></i>
      <I18nText k="dashboard.loading" />
    </div>
    <div v-else-if="error" class="detail-error">
      <i class="bi bi-exclamation-circle"></i>
      {{ error }}
    </div>
    <template v-else-if="group">
      <div class="detail-header">
        <div class="detail-icon detail-icon-group">
          <i class="bi bi-stars"></i>
        </div>
        <div class="detail-heading">
          <h2 class="detail-title">{{ group.label || group.name || group.ref }}</h2>
          <p v-if="group.ref" class="detail-ref">{{ group.ref }}</p>
        </div>
      </div>

      <TeklaTimeline
        v-if="timelineSteps.length"
        :steps="timelineSteps"
        :locale="locale"
        tekla-type="groups"
        :tekla-id="group.id"
        class="detail-timeline-first"
      />

      <div class="detail-overview">
        <section class="detail-section">
          <dl class="detail-meta">
            <dt><I18nText k="detail.coach" /></dt>
            <dd>
              <template v-if="group.coach">
                <template
                  v-if="group.coach.name || [group.coach.firstname, group.coach.lastname].filter(Boolean).join(' ')"
                >
                  {{ group.coach.name || [group.coach.firstname, group.coach.lastname].filter(Boolean).join(' ') }}
                </template>
                <I18nText v-else k="detail.noData" />
                <span v-if="group.coach.email" class="detail-meta-extra">{{ group.coach.email }}</span>
              </template>
              <template v-else><I18nText k="detail.noData" /></template>
            </dd>
            <dt><I18nText k="enroll.organization" /></dt>
            <dd>
              <template v-if="group.organization && group.organization.name">{{ group.organization.name }}</template>
              <I18nText v-else k="detail.noData" />
            </dd>
            <dt><I18nText k="detail.event" /></dt>
            <dd>
              <template v-if="group.event && (group.event.label || group.event.ref)">{{
                group.event.label || group.event.ref
              }}</template>
              <I18nText v-else k="detail.noData" />
            </dd>
            <dt><I18nText k="detail.ort" /></dt>
            <dd>
              <template v-if="group.ort">{{ group.ort }}</template>
              <I18nText v-else k="detail.noData" />
            </dd>
            <dt><I18nText k="detail.institution" /></dt>
            <dd>
              <template v-if="group.institution">{{ group.institution }}</template>
              <I18nText v-else k="detail.noData" />
            </dd>
          </dl>
        </section>

        <section class="detail-section">
          <h3 class="detail-section-title"><I18nText k="enroll.invoiceAddress" /> / <I18nText k="enroll.deliveryAddress" /></h3>
          <p class="detail-address-label"><I18nText k="detail.billingAddress" /></p>
          <p class="detail-address">
            <template
              v-if="group.overview && group.overview.billing_address && formatAddress(group.overview.billing_address)"
            >
              {{ formatAddress(group.overview.billing_address) }}
            </template>
            <I18nText v-else k="detail.noData" />
          </p>
          <p class="detail-address-label"><I18nText k="detail.deliveryAddress" /></p>
          <p class="detail-address">
            <template
              v-if="group.overview && group.overview.delivery_address && formatAddress(group.overview.delivery_address)"
            >
              {{ formatAddress(group.overview.delivery_address) }}
            </template>
            <I18nText v-else k="detail.noData" />
          </p>
        </section>

        <section class="detail-section">
          <h3 class="detail-section-title"><I18nText k="detail.note" /></h3>
          <p class="detail-notes">
            <template v-if="group.note_public">{{ group.note_public }}</template>
            <I18nText v-else k="detail.noData" />
          </p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-view { max-width: 42rem; }
.detail-overview { display: grid; gap: 1.5rem 2rem; }
.detail-loading,
.detail-error { display: flex; align-items: center; gap: 0.5rem; color: var(--color-text-muted); }
.detail-error { color: var(--color-error, #dc2626); }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.detail-header { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; }
.detail-icon { width: 3rem; height: 3rem; border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0; }
.detail-icon-group { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.detail-heading { min-width: 0; }
.detail-title { font-size: var(--text-2xl); font-weight: 600; color: var(--color-text); margin: 0 0 0.25rem; }
.detail-ref { font-size: var(--text-base); color: var(--color-text-muted); margin: 0; }
.detail-section { margin-bottom: 1.5rem; padding: 1rem 0; border-top: 1px solid var(--color-border); }
.detail-section-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.03em; margin: 0 0 0.75rem; }
.detail-meta { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1.5rem; margin: 0; }
.detail-meta dt { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }
.detail-meta dd { font-size: var(--text-base); color: var(--color-text); margin: 0; }
.detail-meta-extra { display: block; font-size: var(--text-sm); color: var(--color-text-muted); margin-top: 0.15rem; }
.detail-address-label { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-muted); margin: 0 0 0.25rem; }
.detail-address { font-size: var(--text-base); color: var(--color-text); margin: 0 0 0.75rem; white-space: pre-line; }
.detail-address:last-child { margin-bottom: 0; }
.detail-notes { font-size: var(--text-base); color: var(--color-text-muted); margin: 1rem 0 0; padding-top: 1rem; border-top: 1px solid var(--color-border); }
@media (min-width: 960px) {
  .detail-view { max-width: 78rem; }
  .detail-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
