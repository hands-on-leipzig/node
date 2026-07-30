<script setup>
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import VenueDetailMap from '@/components/VenueDetailMap.vue'
import {useModalDismiss} from '@/composables/useModalDismiss'
import {
  formatVenueDate,
  formatVenueDateDisplay,
  venueCapacityLabel,
  venueComments,
  venueDisplayName
} from '@/utils/venueFilters'

const props = defineProps({
  show: {type: Boolean, default: false},
  venue: {type: Object, default: null},
})
const emit = defineEmits(['close'])

const {t, locale} = useI18n()

const title = computed(() =>
    props.venue ? venueDisplayName(props.venue, locale.value) : '',
)

const capacityText = computed(() =>
    props.venue ? venueCapacityLabel(props.venue, t) : '',
)

const contacts = computed(() => {
  const list = props.venue?.contacts
  return Array.isArray(list) ? list : []
})

const dialogEl = ref(null)

function onBackdropClick(e) {
  if (e.target === e.currentTarget) emit('close')
}

useModalDismiss(() => props.show, {
  dialogRef: dialogEl,
  onClose: () => emit('close'),
})
</script>

<template>
  <Teleport to="body">
    <Transition name="venue-detail-modal">
      <div
          v-if="show && venue"
          :aria-label="title"
          aria-modal="true"
          class="venue-detail-modal-backdrop"
          role="dialog"
          @click="onBackdropClick"
      >
        <div
            ref="dialogEl"
            class="venue-detail-modal-dialog liquid-surface-scope liquid-surface liquid-surface--accent"
            tabindex="-1"
            @click.stop
        >
          <header class="venue-detail-modal-head">
            <h2 class="venue-detail-modal-title">{{ title }}</h2>
            <button
                :aria-label="t('venues.detailClose')"
                class="venue-detail-modal-close"
                type="button"
                @click="emit('close')"
            >
              <i aria-hidden="true" class="bi bi-x-lg"/>
            </button>
          </header>

          <div class="venue-detail-modal-body">
            <div class="venue-detail-modal-map">
              <VenueDetailMap
                :lat="venue.lat"
                :lon="venue.lon"
                :address="venue.address || ''"
                :zip="venue.zip || ''"
                :country="venue.country || ''"
              />
            </div>
            <aside class="venue-detail-modal-side">
              <p class="venue-detail-meta">
                <i aria-hidden="true" class="bi bi-calendar3"/>
                <template v-if="venue.date">
                  {{ formatVenueDate(venue.date, locale) }}
                  <template v-if="venue.endDate && venue.endDate !== venue.date">
                    – {{ formatVenueDate(venue.endDate, locale) }}
                  </template>
                </template>
                <template v-else>
                  {{ formatVenueDateDisplay(venue.date, locale, t('venues.dateTbd')) }}
                </template>
              </p>
              <p v-if="capacityText" class="venue-detail-meta">
                <i aria-hidden="true" class="bi bi-people"/>
                {{ capacityText }}
              </p>

              <section v-if="venue.location" class="venue-detail-block">
                <h3 class="venue-detail-block-title">
                  <I18nText k="venues.detailAddress"/>
                </h3>
                <p class="venue-detail-text">{{ venue.location }}</p>
              </section>

              <section v-if="venue.supportInfo" class="venue-detail-block">
                <h3 class="venue-detail-block-title">
                  <I18nText k="venues.detailSupport"/>
                </h3>
                <p class="venue-detail-text">{{ venue.supportInfo }}</p>
                <p v-for="comment in venueComments(venue, locale)" :key="comment" class="venue-detail-text">{{ comment }}</p>
              </section>

              <section v-if="contacts.length" class="venue-detail-block">
                <h3 class="venue-detail-block-title">
                  <I18nText k="venues.detailContact"/>
                </h3>
                <div v-for="(c, idx) in contacts" :key="'c-' + idx" class="venue-detail-contact">
                  <p v-if="c.name" class="venue-detail-contact-name">{{ c.name }}</p>
                  <p v-if="c.email" class="venue-detail-contact-line">
                    <a :href="'mailto:' + c.email">{{ c.email }}</a>
                  </p>
                  <p v-if="c.infos" class="venue-detail-text venue-detail-contact-infos">{{ c.infos }}</p>
                </div>
              </section>

              <p v-if="!contacts.length && !venue.location && !venue.supportInfo" class="venue-detail-text-muted">
                <I18nText k="venues.detailNoContact"/>
              </p>

              <a
                  v-if="venue.frontendUrl"
                  :href="venue.frontendUrl"
                  class="venue-detail-link"
                  rel="noopener noreferrer"
                  target="_blank"
              >
                <I18nText k="venues.detailWebsite"/>
                <i aria-hidden="true" class="bi bi-box-arrow-up-right"/>
              </a>
            </aside>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.venue-detail-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: var(--liquid-modal-scrim-bg);
}

.venue-detail-modal-dialog {
  --venue-detail-fg: #1c1917;
  --venue-detail-fg-muted: #44403c;
  --venue-detail-link: #1d4ed8;
  --venue-detail-link-hover: #1e3a8a;
  width: 100%;
  max-width: 56rem;
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--venue-detail-fg);
}

.venue-detail-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.35rem 1.75rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.venue-detail-modal-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.3;
  color: var(--venue-detail-fg);
}

.venue-detail-modal-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.venue-detail-modal-close:hover {
  background: var(--color-bg-muted);
}

.venue-detail-modal-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem 2rem;
  padding: 1.5rem 1.75rem 1.75rem;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.venue-detail-modal-map {
  min-height: 260px;
  display: flex;
  flex-direction: column;
}

.venue-detail-modal-map :deep(.venue-detail-map-wrap) {
  flex: 1;
  min-height: 260px;
}

.venue-detail-modal-side {
  padding: 0.15rem 0 0;
  overflow-y: auto;
  min-width: 0;
  color: var(--venue-detail-fg);
}

.venue-detail-modal-side :deep(.i18n-text),
.venue-detail-modal-side :deep(.i18n-text-main) {
  color: inherit;
}

.venue-detail-meta {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0 0 0.65rem;
  font-size: var(--text-sm);
  color: var(--venue-detail-fg);
}

.venue-detail-block {
  margin-top: 1.25rem;
}

.venue-detail-block-title {
  margin: 0 0 0.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--venue-detail-fg);
}

.venue-detail-text {
  margin: 0 0 0.35rem;
  font-size: var(--text-sm);
  line-height: 1.45;
  white-space: pre-line;
  color: var(--venue-detail-fg);
}

.venue-detail-text-muted {
  margin: 1rem 0 0;
  font-size: var(--text-sm);
  color: var(--venue-detail-fg-muted);
}

.venue-detail-contact {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.venue-detail-contact:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.venue-detail-contact-name {
  margin: 0 0 0.2rem;
  font-weight: 600;
  color: var(--venue-detail-fg);
}

.venue-detail-contact-line {
  margin: 0 0 0.25rem;
  font-size: var(--text-sm);
}

.venue-detail-contact-line a {
  color: var(--venue-detail-link);
  font-weight: 500;
}

.venue-detail-contact-line a:hover {
  color: var(--venue-detail-link-hover);
}

.venue-detail-contact-infos {
  color: var(--venue-detail-fg);
}

.venue-detail-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 1.25rem;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--venue-detail-link);
}

.venue-detail-link:hover {
  color: var(--venue-detail-link-hover);
}

.venue-detail-link :deep(.i18n-text),
.venue-detail-link :deep(.i18n-text-main) {
  color: inherit;
}

.venue-detail-modal-enter-active,
.venue-detail-modal-leave-active {
  transition: opacity 0.2s ease;
}

.venue-detail-modal-enter-active .venue-detail-modal-dialog,
.venue-detail-modal-leave-active .venue-detail-modal-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.venue-detail-modal-enter-from,
.venue-detail-modal-leave-to {
  opacity: 0;
}

.venue-detail-modal-enter-from .venue-detail-modal-dialog,
.venue-detail-modal-leave-to .venue-detail-modal-dialog {
  transform: scale(0.97) translateY(8px);
  opacity: 0;
}

@media (max-width: 720px) {
  .venue-detail-modal-body {
    grid-template-columns: 1fr;
    gap: 1.25rem;
    padding: 1.25rem 1.35rem 1.5rem;
  }

  .venue-detail-modal-map {
    min-height: 220px;
  }

  .venue-detail-modal-map :deep(.venue-detail-map-wrap) {
    min-height: 220px;
  }
}
</style>

<style>
/* Teleport to body: theme tokens without scoped-attribute mismatch */
html[data-theme='dark'] .venue-detail-modal-dialog {
  --venue-detail-fg: #fafaf9;
  --venue-detail-fg-muted: #d6d3d1;
  --venue-detail-link: #93c5fd;
  --venue-detail-link-hover: #bfdbfe;
}
</style>
