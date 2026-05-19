<script setup>
import { computed } from 'vue'
import { resolveEnrollmentDisplay } from '@/utils/enrollmentDisplay'

const props = defineProps({
  /** Team, class, or group card from the API (`program`, `element`). */
  card: {
    type: Object,
    default: null,
  },
})

const badges = computed(() => resolveEnrollmentDisplay(props.card)?.badges ?? [])
</script>

<template>
  <div v-if="badges.length" class="detail-enrollment-badges" role="list">
    <span
      v-for="(badge, idx) in badges"
      :key="`${badge.key}-${idx}`"
      class="detail-enrollment-badge"
      role="listitem"
    >
      <I18nText :k="badge.key" :values="badge.values" />
    </span>
  </div>
</template>

<style scoped>
.detail-enrollment-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.65rem;
}

.detail-enrollment-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.32rem 0.72rem;
  border-radius: var(--radius-full, 999px);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  color: var(--color-accent);
  background: var(--color-accent-soft);
  border: 1px solid color-mix(in srgb, var(--color-accent) 28%, transparent);
}
</style>
