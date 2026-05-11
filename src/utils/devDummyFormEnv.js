/**
 * Whether to show the "Dummy-Daten eintragen" helper on forms.
 *
 * Enabled when:
 * - `vite` dev server (`import.meta.env.DEV`), or
 * - `vite build --mode test|staging|dev|development`, or
 * - `VITE_ENABLE_DEV_DUMMY_FORM_FILL=true` (for production builds deployed to dev/test hosts)
 *
 * Disabled on default `vite build` (production) unless the env flag is explicitly set.
 * Set `VITE_ENABLE_DEV_DUMMY_FORM_FILL=false` to force-disable (e.g. local build of prod bundle).
 */
export function isDevDummyFormFillEnabled() {
  const raw = String(import.meta.env.VITE_ENABLE_DEV_DUMMY_FORM_FILL ?? '').trim().toLowerCase()
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true
  if (import.meta.env.DEV) return true
  const mode = String(import.meta.env.MODE || '').toLowerCase()
  if (['test', 'staging', 'development', 'dev'].includes(mode)) return true
  return false
}
