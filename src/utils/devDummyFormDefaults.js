/** Address block compatible with {@link AddressSelector} / enroll payloads (`new.country` may be 2-letter). */
export function newDummyAddressState() {
  return {
    useExisting: false,
    addressId: '',
    new: {
      street: 'Robotikallee 12',
      postalCode: '10115',
      city: 'Berlin',
      country: 'DE',
    },
  }
}

export function cloneDummyAddressState() {
  const a = newDummyAddressState()
  return {
    useExisting: a.useExisting,
    addressId: a.addressId,
    new: { ...a.new },
  }
}
