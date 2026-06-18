import { isDolibarrRowId } from '@/services/draht'

/** @typedef {'invoice' | 'delivery'} AddressFormMode */

export const ADDRESS_MODE_INVOICE = 'invoice'
export const ADDRESS_MODE_DELIVERY = 'delivery'

const INVOICE_EINVOICE_DEFAULTS = {
  leitwegId: '',
  supplierNumber: '',
  orderReference: '',
  netInvoiceDesired: null, // null | true | false
  vatId: '',
  registeredAsCompany: null, // null | true | false
}

/**
 * @param {AddressFormMode} mode
 */
export function emptyAddressNewFields(mode) {
  const base = { street: '', houseNumber: '', postalCode: '', city: '', country: '' }
  if (mode === ADDRESS_MODE_INVOICE) {
    return {
      ...base,
      institution: '',
      contactPerson: '',
      addressLine3: '',
      ...INVOICE_EINVOICE_DEFAULTS,
    }
  }
  if (mode === ADDRESS_MODE_DELIVERY) {
    return { ...base, name: '', addressLine2: '', addressLine3: '', state: '' }
  }
  return base
}

/**
 * @param {AddressFormMode} mode
 */
export function emptyAddressState(mode) {
  return {
    useExisting: true,
    addressId: '',
    new: emptyAddressNewFields(mode),
  }
}

/** @param {Record<string, unknown> | null | undefined} addr */
export function addressListEntryId(addr) {
  if (!addr || typeof addr !== 'object') return ''
  const raw = addr.id ?? addr.addressId ?? addr.rowid
  return raw != null ? String(raw).trim() : ''
}

/**
 * When "saved address" mode is on, ensure addressId points at a row in the list (defaults to first entry).
 *
 * @param {{ useExisting?: boolean, addressId?: string } | null | undefined} state
 * @param {Array<Record<string, unknown>>} addresses
 */
export function syncExistingAddressSelection(state, addresses) {
  if (!state || state.useExisting === false) return state
  const list = Array.isArray(addresses) ? addresses : []
  if (!list.length) {
    return { ...state, addressId: '' }
  }
  const current = String(state.addressId ?? '').trim()
  if (isDolibarrRowId(current) && list.some((a) => addressListEntryId(a) === current)) {
    return state
  }
  const firstId = addressListEntryId(list[0])
  if (!isDolibarrRowId(firstId)) return state
  return {
    ...state,
    useExisting: true,
    addressId: String(Number(firstId)),
  }
}

function parseYesNo(value) {
  if (value === true || value === 'yes' || value === '1' || value === 1) return true
  if (value === false || value === 'no' || value === '0' || value === 0) return false
  return null
}

/** @param {unknown} country */
export function normalizeInvoiceCountry(country) {
  return String(country || '').trim().toLowerCase()
}

/** USt-IdNr. nur für Deutschland und Österreich. */
export function invoiceCountryUsesVatId(country) {
  const c = normalizeInvoiceCountry(country)
  return c === 'de' || c === 'at'
}

/** „Als Unternehmen registriert“ nur für die Schweiz. */
export function invoiceCountryUsesRegisteredAsCompany(country) {
  return normalizeInvoiceCountry(country) === 'ch'
}

/** @param {Record<string, unknown> | null | undefined} n */
export function invoiceNeedsVatId(n) {
  if (parseYesNo(n?.netInvoiceDesired) !== true) return false
  return invoiceCountryUsesVatId(n?.country)
}

/** @param {Record<string, unknown> | null | undefined} n */
export function invoiceNeedsRegisteredAsCompany(n) {
  return invoiceCountryUsesRegisteredAsCompany(n?.country)
}

/**
 * @param {Record<string, unknown> | null | undefined} n
 * @param {AddressFormMode} mode
 */
export function isAddressNewValid(n, mode) {
  if (!n || typeof n !== 'object') return false
  const street = String(n.street || '').trim()
  const houseNumber = String(n.houseNumber || '').trim()
  const postalCode = String(n.postalCode || '').trim()
  const city = String(n.city || '').trim()
  const country = String(n.country || '').trim()
  if (!street || !houseNumber || !postalCode || !city || !country) return false
  if (mode === ADDRESS_MODE_INVOICE) {
    if (!String(n.institution || '').trim()) return false
    const netInvoice = parseYesNo(n.netInvoiceDesired)
    if (netInvoice === null) return false
    if (invoiceNeedsVatId(n) && !String(n.vatId || '').trim()) return false
    if (invoiceNeedsRegisteredAsCompany(n) && parseYesNo(n.registeredAsCompany) === null) return false
    return true
  }
  if (mode === ADDRESS_MODE_DELIVERY) {
    return !!String(n.name || '').trim()
  }
  return true
}

/**
 * @param {{ new?: Record<string, unknown> } | null | undefined} addr
 * @param {AddressFormMode} mode
 */
export function buildNewAddressPayload(addr, mode) {
  const n = addr?.new || {}
  if (!isAddressNewValid(n, mode)) return undefined
  const payload = {
    street: String(n.street || '').trim(),
    houseNumber: String(n.houseNumber || '').trim(),
    postalCode: String(n.postalCode || '').trim(),
    city: String(n.city || '').trim(),
    country: String(n.country || '').trim(),
  }
  if (mode === ADDRESS_MODE_INVOICE) {
    payload.institution = String(n.institution || '').trim()
    const contactPerson = String(n.contactPerson || '').trim()
    if (contactPerson) payload.contactPerson = contactPerson
    const addressLine3 = String(n.addressLine3 || '').trim()
    if (addressLine3) payload.addressLine3 = addressLine3

    const leitwegId = String(n.leitwegId || '').trim()
    if (leitwegId) payload.leitwegId = leitwegId
    const supplierNumber = String(n.supplierNumber || '').trim()
    if (supplierNumber) payload.supplierNumber = supplierNumber
    const orderReference = String(n.orderReference || '').trim()
    if (orderReference) payload.orderReference = orderReference
    const netInvoice = parseYesNo(n.netInvoiceDesired)
    if (netInvoice !== null) payload.netInvoiceDesired = netInvoice
    if (invoiceNeedsVatId(n)) {
      payload.vatId = String(n.vatId || '').trim()
    }
    const registered = parseYesNo(n.registeredAsCompany)
    if (invoiceNeedsRegisteredAsCompany(n) && registered !== null) {
      payload.registeredAsCompany = registered
    }
  } else if (mode === ADDRESS_MODE_DELIVERY) {
    payload.name = String(n.name || '').trim()
    const addressLine2 = String(n.addressLine2 || '').trim()
    if (addressLine2) payload.addressLine2 = addressLine2
    const addressLine3 = String(n.addressLine3 || '').trim()
    if (addressLine3) payload.addressLine3 = addressLine3
    const state = String(n.state || '').trim()
    if (state) payload.state = state
  }
  return payload
}
