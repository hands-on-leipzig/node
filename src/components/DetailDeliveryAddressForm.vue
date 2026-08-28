<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AddressSelector from '@/components/AddressSelector.vue'
import I18nText from '@/components/I18nText.vue'
import {
  listAddressBookGrouped,
  updateTeamDeliveryAddress,
  updateClassDeliveryAddress,
  updateGroupDeliveryAddress,
  isDolibarrRowId,
  unwrapNodeCard,
} from '@/services/draht'
import {
  ADDRESS_MODE_DELIVERY,
  emptyAddressState,
  syncExistingAddressSelection,
  buildNewAddressPayload,
} from '@/utils/addressForm'

const props = defineProps({
  teklaType: {
    type: String,
    required: true,
    validator: (v) => ['teams', 'classes', 'groups'].includes(v),
  },
  teklaId: { type: [String, Number], required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['saved'])

const { t } = useI18n()
const deliveryAddress = ref(emptyAddressState(ADDRESS_MODE_DELIVERY))
const deliveryAddresses = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')

const canSave = computed(() => {
  const addr = deliveryAddress.value
  if (addr?.useExisting !== false && isDolibarrRowId(addr?.addressId)) return true
  return !!buildNewAddressPayload(addr, ADDRESS_MODE_DELIVERY)
})

function buildPayload() {
  const addr = deliveryAddress.value
  if (addr?.useExisting !== false && isDolibarrRowId(addr?.addressId)) {
    return { addressId: String(Number(String(addr.addressId).trim())) }
  }
  return buildNewAddressPayload(addr, ADDRESS_MODE_DELIVERY) || null
}

async function loadAddresses() {
  loading.value = true
  error.value = ''
  try {
    const grouped = await listAddressBookGrouped()
    deliveryAddresses.value = Array.isArray(grouped?.delivery)
      ? grouped.delivery
      : (Array.isArray(grouped?.combined) ? grouped.combined : [])
    if (deliveryAddresses.value.length > 0) {
      deliveryAddress.value = syncExistingAddressSelection(
        { ...deliveryAddress.value, useExisting: true },
        deliveryAddresses.value,
      )
    } else {
      deliveryAddress.value = { ...deliveryAddress.value, useExisting: false, addressId: '' }
    }
  } catch {
    deliveryAddresses.value = []
    deliveryAddress.value = { ...deliveryAddress.value, useExisting: false, addressId: '' }
  } finally {
    loading.value = false
  }
}

async function save() {
  if (props.disabled || !canSave.value || !props.teklaId) return
  const payload = buildPayload()
  if (!payload) return
  saving.value = true
  error.value = ''
  try {
    const body = { deliveryAddress: payload }
    let res
    if (props.teklaType === 'classes') res = await updateClassDeliveryAddress(props.teklaId, body)
    else if (props.teklaType === 'groups') res = await updateGroupDeliveryAddress(props.teklaId, body)
    else res = await updateTeamDeliveryAddress(props.teklaId, body)
    emit('saved', unwrapNodeCard(res) || res?.data || res)
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.response?.data?.message || e.message || t('errors.loadFailed')
  } finally {
    saving.value = false
  }
}

onMounted(loadAddresses)
</script>

<template>
  <div class="detail-delivery-form">
    <p class="detail-delivery-form-lead"><I18nText k="detail.shipmentNeedsDeliveryAddress" /></p>
    <p v-if="loading" class="detail-delivery-form-muted">
      <i class="bi bi-arrow-repeat spin" />
    </p>
    <AddressSelector
      v-else
      v-model="deliveryAddress"
      mode="delivery"
      :addresses="deliveryAddresses"
      :label="t('detail.deliveryAddress')"
      id-prefix="detail-delivery"
    />
    <p v-if="error" class="detail-delivery-form-error">{{ error }}</p>
    <button
      type="button"
      class="detail-btn detail-btn-primary"
      :disabled="disabled || saving || !canSave"
      @click="save"
    >
      <i v-if="saving" class="bi bi-arrow-repeat spin" />
      <I18nText v-else k="detail.shipmentSaveDeliveryAddress" />
    </button>
  </div>
</template>

<style scoped>
.detail-delivery-form {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.65rem;
}
.detail-delivery-form-lead {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}
.detail-delivery-form-muted,
.detail-delivery-form-error {
  margin: 0;
  font-size: 0.88rem;
}
.detail-delivery-form-error { color: var(--color-danger, #dc2626); }
.detail-btn {
  justify-self: start;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  border-radius: var(--radius);
  padding: 0.4rem 0.75rem;
  font-size: 0.88rem;
  cursor: pointer;
}
.detail-btn-primary {
  background: var(--color-accent, #1d4ed8);
  border-color: transparent;
  color: #fff;
}
.detail-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
