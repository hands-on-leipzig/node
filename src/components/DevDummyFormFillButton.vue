<script setup>
import { useI18n } from 'vue-i18n'
import { isDevDummyFormFillEnabled } from '@/utils/devDummyFormEnv'

const { t } = useI18n()
const emit = defineEmits(['click'])
</script>

<template>
  <div v-if="isDevDummyFormFillEnabled()" class="dev-dummy-form-fill">
    <button type="button" class="btn btn-ghost btn-sm dev-dummy-form-fill__btn" @click="emit('click')">
      <i class="bi bi-magic" aria-hidden="true" />
      {{ t('common.devDummyFormFill') }}
    </button>
  </div>
</template>

<style scoped>
.dev-dummy-form-fill {
  margin-bottom: 0.65rem;
}
.dev-dummy-form-fill__btn {
  border: 1px dashed color-mix(in srgb, var(--color-accent) 55%, var(--color-border));
  color: var(--color-accent);
}
</style>
