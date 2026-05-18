import { onMounted, ref, watch } from 'vue'
import { fetchEnrollmentPricingQuote } from '@/services/draht'

/**
 * Debounced unified-rules pricing quote for the enrollment wizard.
 *
 * @param {() => object|null} getPayload Returns null to skip fetch.
 */
export function useEnrollmentPricingQuote(getPayload) {
  const quote = ref(null)
  const loading = ref(false)
  const error = ref(null)
  let timer = null
  let seq = 0

  async function load() {
    const payload = getPayload()
    if (!payload) {
      quote.value = null
      error.value = null
      loading.value = false
      return
    }
    const mySeq = ++seq
    loading.value = true
    error.value = null
    try {
      const data = await fetchEnrollmentPricingQuote(payload)
      if (mySeq !== seq) return
      quote.value = data?.ok ? data : data
      if (!data?.ok) {
        error.value = data?.message || 'quote_failed'
      }
    } catch (e) {
      if (mySeq !== seq) return
      quote.value = null
      error.value = e?.message || 'quote_failed'
    } finally {
      if (mySeq === seq) loading.value = false
    }
  }

  function schedule(ms = 280) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      load()
    }, ms)
  }

  watch(getPayload, () => schedule(), { deep: true })
  onMounted(() => schedule(50))

  return { quote, loading, error, refresh: load }
}

/**
 * @param {Array<{category?: string, lineGrossEur?: number}>|undefined} lines
 * @param {string} category
 * @returns {number}
 */
export function sumQuoteLinesByCategory(lines, category) {
  if (!Array.isArray(lines)) return 0
  return lines.reduce((sum, ln) => {
    if (ln?.category === category) {
      const v = Number(ln.lineGrossEur)
      return sum + (Number.isFinite(v) ? v : 0)
    }
    return sum
  }, 0)
}

/**
 * @param {object|undefined} line
 * @returns {number}
 */
export function quoteLineUnitGross(line) {
  const u = Number(line?.unitGrossEur)
  return Number.isFinite(u) ? u : 0
}
