<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import I18nText from '@/components/I18nText.vue'

const { t } = useI18n()

const mailtoHref = computed(() => {
  const subject = encodeURIComponent(t('wizard.eventDeadlineMailSubject'))
  return `mailto:info@hands-on-technology.org?subject=${subject}`
})
</script>

<template>
  <div class="event-deadline-banner" role="note">
    <i class="bi bi-envelope" aria-hidden="true" />
    <p class="event-deadline-banner-text">
      <I18nText k="wizard.eventDeadlineBannerLead" />
      <a class="event-deadline-banner-link" :href="mailtoHref">info@hands-on-technology.org</a><I18nText k="wizard.eventDeadlineBannerTail" />
    </p>
  </div>
</template>

<style scoped>
.event-deadline-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  margin: 0.75rem 0 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
}
.event-deadline-banner .bi {
  flex-shrink: 0;
  margin-top: 0.1rem;
  font-size: 1rem;
}
.event-deadline-banner-text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
}
.event-deadline-banner-link {
  color: var(--color-accent);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.event-deadline-banner-link:hover {
  color: var(--color-accent);
}
</style>
