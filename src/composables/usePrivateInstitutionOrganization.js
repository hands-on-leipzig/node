import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * When `schoolType` is `privat`, keep `organization` in sync with the translated "Privat" label
 * and expose `isPrivateInstitution` to disable the institution name field.
 *
 * @param {import('vue').Ref<Record<string, unknown>>} formRef ref to form object with `schoolType` and `organization`
 */
export function usePrivateInstitutionOrganization(formRef) {
  const { t, locale } = useI18n()
  const autoPrivatActive = ref(false)

  const isPrivateInstitution = computed(() => formRef.value?.schoolType === 'privat')

  watch(
    () => formRef.value?.schoolType,
    (st) => {
      const f = formRef.value
      if (!f) return
      if (st === 'privat') {
        f.organization = t('schoolTypes.privat')
        autoPrivatActive.value = true
      } else if (autoPrivatActive.value) {
        f.organization = ''
        autoPrivatActive.value = false
      }
    },
    { immediate: true },
  )

  watch(locale, () => {
    if (formRef.value?.schoolType === 'privat') {
      formRef.value.organization = t('schoolTypes.privat')
    }
  })

  return { isPrivateInstitution }
}
