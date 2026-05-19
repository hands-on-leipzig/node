<script setup>
import { computed } from 'vue'
import { resolveDetailHeadline } from '@/utils/enrollmentDisplay'
import DetailEnrollmentBadges from '@/components/DetailEnrollmentBadges.vue'

const props = defineProps({
  card: { type: Object, required: true },
  /** @type {'team'|'class'|'group'} */
  kind: { type: String, required: true },
})

const headline = computed(() => resolveDetailHeadline(props.card, props.kind))
</script>

<template>
  <div class="detail-header">
    <div class="detail-heading">
      <h2 class="detail-title">
        <I18nText v-if="headline.i18nKey" :k="headline.i18nKey" />
        <template v-else>{{ headline.text }}</template>
      </h2>
      <p v-if="headline.ref" class="detail-ref">{{ headline.ref }}</p>
      <DetailEnrollmentBadges :card="card" />
    </div>
  </div>
</template>

<style scoped>
.detail-header {
  margin-bottom: 1.5rem;
}
.detail-heading {
  min-width: 0;
}
.detail-title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.25rem;
}
.detail-ref {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin: 0;
}
</style>
