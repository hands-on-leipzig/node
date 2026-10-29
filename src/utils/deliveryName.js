/** DHL name1 / contactName on the ship-to label. */
export const DELIVERY_NAME_MAX_LENGTH = 50

/**
 * Unicode code points, after trim. Matches the string DHL receives as the consignee name.
 *
 * @param {unknown} value
 */
export function deliveryNameLength(value) {
  return [...String(value ?? '').trim()].length
}

/** @param {unknown} value */
export function isDeliveryNameTooLong(value) {
  return deliveryNameLength(value) > DELIVERY_NAME_MAX_LENGTH
}

/**
 * Name that would be printed on the DHL label for a saved address-book row.
 * Invoice rows use the institution (societe name); delivery rows use the contact name.
 *
 * @param {Record<string, unknown> | null | undefined} entry
 */
export function addressBookShipToName(entry) {
  if (!entry || typeof entry !== 'object') return ''
  const institution = String(entry.institution || '').trim()
  if (institution) return institution
  const name = String(entry.name || '').trim()
  if (name) return name
  return String(entry.label || '').trim()
}

/**
 * @param {{ useExisting?: boolean, addressId?: string } | null | undefined} state
 * @param {Array<Record<string, unknown>> | null | undefined} addresses
 */
function savedAddressById(state, addresses) {
  const id = String(state?.addressId ?? '').trim()
  if (!id) return null
  const list = Array.isArray(addresses) ? addresses : []
  return list.find((entry) => String(entry?.id ?? '') === id) || null
}

/**
 * Institution name used as the ship-to name when delivery = invoice.
 *
 * @param {{ useExisting?: boolean, addressId?: string, new?: Record<string, unknown> } | null | undefined} state
 * @param {Array<Record<string, unknown>> | null | undefined} addresses
 */
export function invoiceNameForDelivery(state, addresses) {
  if (!state) return ''
  if (state.useExisting !== false) {
    return addressBookShipToName(savedAddressById(state, addresses))
  }
  const institution = String(state.new?.institution || '').trim()
  if (institution) return institution
  return String(state.new?.contactPerson || '').trim()
}

/**
 * Explicit delivery-address name (new field or selected saved contact).
 *
 * @param {{ useExisting?: boolean, addressId?: string, new?: Record<string, unknown> } | null | undefined} state
 * @param {Array<Record<string, unknown>> | null | undefined} addresses
 */
export function deliveryNameFromForm(state, addresses) {
  if (!state) return ''
  if (state.useExisting !== false) {
    return addressBookShipToName(savedAddressById(state, addresses))
  }
  return String(state.new?.name || '').trim()
}
