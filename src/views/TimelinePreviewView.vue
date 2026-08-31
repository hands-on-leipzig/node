<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TeklaStatusBoard from '@/components/TeklaStatusBoard.vue'

const { locale } = useI18n()
const scenario = ref('crcMissing')

const scenarios = [
  { id: 'crcMissing', label: 'Führungszeugnis fehlt' },
  { id: 'addressMissing', label: 'Lieferadresse fehlt' },
  { id: 'invoiceOpen', label: 'Rechnung offen' },
  { id: 'teamData', label: 'Teamdaten unvollständig, kein Versand' },
  { id: 'ready', label: 'Alles erfüllt, wartet auf Termin' },
  { id: 'noShipment', label: 'Kein Versand, keine Rechnung' },
  { id: 'delivered', label: 'Zugestellt' },
]

const fixtures = {
  crcMissing: {
    alert: { de: 'Führungszeugnis fehlt', en: 'CRC missing', status: 'warn' },
    steps: [
      {
        de: 'Versand',
        en: 'Shipment',
        status: 'progress',
        picto: 'truck',
        items: [
          { type: 'order', label: 'SO2026-104', status: 'validated' },
          { type: 'invoice', label: 'RE2026-88', status: 'paid' },
        ],
      },
      { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
      { de: 'Rechnung', en: 'Invoice', status: 'closed', picto: 'receipt' },
    ],
    shipmentSchedule: {
      hasDeliveryAddress: true,
      earliestDate: '2026-09-02',
      standardDate: '2026-09-02',
    },
  },
  addressMissing: {
    alert: null,
    steps: [
      {
        de: 'Versand',
        en: 'Shipment',
        status: 'progress',
        picto: 'truck',
        items: [
          { type: 'order', label: 'SO2026-104', status: 'validated' },
          { type: 'invoice', label: 'RE2026-88', status: 'paid' },
        ],
      },
      { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
      { de: 'Rechnung', en: 'Invoice', status: 'closed', picto: 'receipt' },
    ],
    shipmentSchedule: {
      hasDeliveryAddress: false,
      earliestDate: null,
      standardDate: null,
    },
  },
  invoiceOpen: {
    alert: null,
    steps: [
      { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
      {
        de: 'Rechnung',
        en: 'Invoice',
        status: 'progress',
        picto: 'receipt',
        items: [{ type: 'invoice', label: 'RE2026-91', status: 'open' }],
      },
      {
        de: 'Versand',
        en: 'Shipment',
        status: 'progress',
        picto: 'truck',
        items: [{ type: 'order', label: 'SO2026-118', status: 'validated' }],
      },
    ],
    shipmentSchedule: {
      hasDeliveryAddress: true,
      earliestDate: '2026-09-02',
      standardDate: '2026-09-02',
    },
  },
  teamData: {
    alert: null,
    steps: [
      { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
      { de: 'Kein Versand', en: 'No shipment', status: 'closed', picto: 'truck' },
      {
        de: 'Rechnung',
        en: 'Invoice',
        status: 'closed',
        picto: 'receipt',
        de_sub: 'nicht benötigt',
        items: [{ type: 'invoice', status: 'not_needed' }],
      },
      { de: 'Teamdaten', en: 'Team data', status: 'open', de_sub: 'unvollständig' },
    ],
    shipmentSchedule: null,
  },
  ready: {
    alert: null,
    steps: [
      {
        de: 'Versand',
        en: 'Shipment',
        status: 'progress',
        picto: 'truck',
        items: [
          { type: 'order', label: 'SO2026-120', status: 'validated' },
          { type: 'invoice', label: 'RE2026-99', status: 'paid' },
        ],
      },
      { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
      { de: 'Rechnung', en: 'Invoice', status: 'closed', picto: 'receipt' },
    ],
    shipmentSchedule: {
      hasDeliveryAddress: true,
      earliestDate: '2026-09-02',
      standardDate: '2026-09-02',
    },
  },
  noShipment: {
    alert: null,
    steps: [
      { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
      { de: 'Kein Versand', en: 'No shipment', status: 'closed', picto: 'truck' },
      {
        de: 'Rechnung',
        en: 'Invoice',
        status: 'closed',
        picto: 'receipt',
        de_sub: 'nicht benötigt',
        items: [{ type: 'invoice', label: 'RE2026-12', status: 'not_needed' }],
      },
      { de: 'Teamdaten', en: 'Team data', status: 'closed', de_sub: 'vollständig' },
    ],
    shipmentSchedule: null,
  },
  delivered: {
    alert: null,
    steps: [
      {
        de: 'Material',
        en: 'Material',
        status: 'closed',
        picto: 'truck',
        items: [
          { type: 'order', label: 'SO2026-44', status: 'closed' },
          { type: 'invoice', label: 'RE2026-44', status: 'paid' },
          { type: 'shipment', label: 'SH2026-44', status: 'delivered', link: 'https://example.com', link_text: '00340434' },
        ],
      },
      { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
      { de: 'Rechnung', en: 'Invoice', status: 'closed', picto: 'receipt' },
    ],
    shipmentSchedule: {
      hasDeliveryAddress: true,
      earliestDate: '2026-08-12',
      standardDate: '2026-08-12',
      locked: true,
    },
  },
}

const current = computed(() => fixtures[scenario.value])
</script>

<template>
  <main class="preview">
    <header class="preview-head">
      <p class="preview-kicker">Coach-Vorschlag</p>
      <h1>Stand der Anmeldung</h1>
      <p class="preview-lead">
        Fester Prozess: Anmeldung, Rechnung, Versand, Teamdaten. Die Punkte darunter
        gelten nur, wenn sie für diese Anmeldung zutreffen — etwa ein fehlendes Führungszeugnis.
      </p>
      <div class="preview-controls">
        <label>
          Szenario
          <select v-model="scenario">
            <option v-for="item in scenarios" :key="item.id" :value="item.id">{{ item.label }}</option>
          </select>
        </label>
        <label>
          Sprache
          <select v-model="locale">
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </header>
    <section id="detail-addresses" class="preview-card">
      <TeklaStatusBoard
        :steps="current.steps"
        :alert="current.alert"
        :locale="locale"
        :shipment-schedule="current.shipmentSchedule"
        tekla-type="teams"
        :tekla-id="null"
      />
    </section>
  </main>
</template>

<style scoped>
.preview {
  max-width: 42rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}

.preview-kicker {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.preview-head h1 {
  margin: 0 0 0.5rem;
  font-size: 1.6rem;
}

.preview-lead {
  margin: 0 0 1rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.preview-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  margin-bottom: 1.25rem;
}

.preview-controls label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.preview-controls select {
  min-width: 16rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-elevated);
  color: var(--color-text);
}

.preview-card {
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-elevated);
}
</style>
