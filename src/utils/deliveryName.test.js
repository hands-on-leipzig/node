import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  DELIVERY_NAME_MAX_LENGTH,
  deliveryNameFromForm,
  invoiceNameForDelivery,
  isDeliveryNameTooLong,
} from './deliveryName.js'

const longName = 'A'.repeat(DELIVERY_NAME_MAX_LENGTH + 1)
const maxName = 'Ä'.repeat(DELIVERY_NAME_MAX_LENGTH)

describe('isDeliveryNameTooLong', () => {
  it('allows 50 characters and rejects 51', () => {
    assert.equal(isDeliveryNameTooLong(maxName), false)
    assert.equal(isDeliveryNameTooLong(longName), true)
    assert.equal(isDeliveryNameTooLong('  ' + maxName + '  '), false)
    assert.equal(isDeliveryNameTooLong(''), false)
  })
})

describe('invoiceNameForDelivery', () => {
  it('uses the institution when the invoice address is also the ship-to name', () => {
    assert.equal(
      invoiceNameForDelivery({ useExisting: false, new: { institution: longName, contactPerson: 'Ada' } }, []),
      longName,
    )
    assert.equal(isDeliveryNameTooLong(invoiceNameForDelivery(
      { useExisting: false, new: { institution: longName } },
      [],
    )), true)
  })

  it('uses a saved invoice address name', () => {
    const addresses = [{ id: '4', name: longName, label: 'short' }]
    assert.equal(
      invoiceNameForDelivery({ useExisting: true, addressId: '4' }, addresses),
      longName,
    )
  })

  it('falls back to the contact person only when the institution is empty', () => {
    assert.equal(
      invoiceNameForDelivery({ useExisting: false, new: { institution: '  ', contactPerson: 'Ada Lovelace' } }, []),
      'Ada Lovelace',
    )
  })
})

describe('deliveryNameFromForm', () => {
  it('reads the new delivery name and a saved contact name', () => {
    assert.equal(
      deliveryNameFromForm({ useExisting: false, new: { name: maxName } }, []),
      maxName,
    )
    assert.equal(
      deliveryNameFromForm(
        { useExisting: true, addressId: '9' },
        [{ id: '9', name: longName }],
      ),
      longName,
    )
  })
})
