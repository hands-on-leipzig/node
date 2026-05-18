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
      :class="`detail-enrollment-badge--${badge.tone}`"
      role="listitem"
    >
      <I18nText :k="badge.key" />
    </span>
  </div>
</template>

<style scoped>
.detail-enrollment-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}
.detail-enrollment-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.25;
  border: 1px solid var(--liquid-border);
  background: var(--liquid-tile-bg-inner);
  color: var(--color-text);
}
.detail-enrollment-badge--founders {
  border-color: color-mix(in srgb, var(--color-accent) 35%, var(--liquid-border));
  background: color-mix(in srgb, var(--color-accent) 12%, var(--liquid-tile-bg-inner));
}
.detail-enrollment-badge--future {
  border-color: color-mix(in srgb, #1565c0 40%, var(--liquid-border));
  background: color-mix(in srgb, #1565c0 12%, var(--liquid-tile-bg-inner));
}
.detail-enrollment-badge--explore {
  border-color: color-mix(in srgb, #2e7d32 40%, var(--liquid-border));
  background: color-mix(in srgb, #2e7d32 14%, var(--liquid-tile-bg-inner));
}
.detail-enrollment-badge--challenge {
  border-color: color-mix(in srgb, #c62828 38%, var(--liquid-border));
  background: color-mix(in srgb, #c62828 12%, var(--liquid-tile-bg-inner));
}
.detail-enrollment-badge--future5,
.detail-enrollment-badge--future8 {
  border-color: color-mix(in srgb, #1565c0 40%, var(--liquid-border));
  background: color-mix(in srgb, #1565c0 14%, var(--liquid-tile-bg-inner));
}
.detail-enrollment-badge--format {
  border-color: color-mix(in srgb, var(--color-text-muted) 28%, var(--liquid-border));
  background: color-mix(in srgb, var(--color-text-muted) 8%, var(--liquid-tile-bg-inner));
  font-weight: 500;
}
</style>
