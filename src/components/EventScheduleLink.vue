<script setup>
import { computed } from 'vue'
import { publicPlanUrl } from '@/utils/publicPlan'

const props = defineProps({
  /** Event as it comes from DRAHT (card.event or an event list row). */
  event: { type: Object, default: null },
})

const url = computed(() => publicPlanUrl(props.event))
</script>

<template>
  <a
    v-if="url"
    :href="url"
    class="event-schedule-link"
    rel="noopener noreferrer"
    target="_blank"
  >
    <I18nText k="detail.eventScheduleLink" />
    <i aria-hidden="true" class="bi bi-box-arrow-up-right" />
  </a>
</template>

<style scoped>
.event-schedule-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.35rem;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-accent, #0d6efd);
  text-decoration: none;
}

.event-schedule-link:hover {
  text-decoration: underline;
}

.event-schedule-link :deep(.i18n-text),
.event-schedule-link :deep(.i18n-text-main) {
  color: inherit;
}
</style>
