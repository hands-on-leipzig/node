import { ADDRESS_MODE_INVOICE } from '@/utils/addressForm'

/** @param {'invoice'|'delivery'} mode */
export function addressAutofillScope(mode) {
  return mode === ADDRESS_MODE_INVOICE ? 'billing' : 'shipping'
}

/**
 * WHATWG autofill tokens for invoice (billing) / delivery (shipping) address fields.
 * @param {'invoice'|'delivery'} mode
 * @param {string} field
 */
export function addressAutocomplete(mode, field) {
  const scope = addressAutofillScope(mode)
  /** @type {Record<string, string>} */
  const map = {
    institution: `${scope} organization`,
    contactPerson: `${scope} name`,
    name: `${scope} name`,
    street: `${scope} street-address`,
    postalCode: `${scope} postal-code`,
    city: `${scope} address-level2`,
    state: `${scope} address-level1`,
    country: `${scope} country`,
    addressLine2: `${scope} address-line2`,
    addressLine3: `${scope} address-line3`,
    vatId: 'off',
    leitwegId: 'off',
    supplierNumber: 'off',
    orderReference: 'off',
  }
  return map[field] ?? 'on'
}

/** Stable `name` for browsers that key off name + autocomplete. */
export function addressFieldName(idPrefix, field) {
  return `${idPrefix}-${field}`
}

/**
 * Institution / school location (wizard step — not billing/shipping on the same screen).
 * @param {string} field
 */
export function institutionAutocomplete(field) {
  /** @type {Record<string, string>} */
  const map = {
    organization: 'organization',
    postalCode: 'postal-code',
    city: 'address-level2',
    state: 'address-level1',
    country: 'country',
  }
  return map[field] ?? 'on'
}

export function institutionFieldName(field) {
  return `wizard-institution-${field}`
}
