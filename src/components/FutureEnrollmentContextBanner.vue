<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { isFutureProgram, isFutureEnrollmentEntry, listTeams, parseNodeListPayload } from '@/services/draht'

const props = defineProps({
  /** @type {'group'|'team'} */
  kind: { type: String, required: true },
  card: { type: Object, required: true },
})

const { t } = useI18n()

function displayRef(item) {
  if (!item || typeof item !== 'object') return ''
  const ref = item.ref != null ? String(item.ref).trim() : ''
  if (ref) return ref
  const id = item.id != null ? Number(item.id) : 0
  return id > 0 ? `#${id}` : ''
}

const groupRef = computed(() => {
  if (props.kind === 'group') return displayRef(props.card)
  const pg = props.card?.parentGroup
  return displayRef(pg) || (props.card?.groupId ? `#${props.card.groupId}` : '')
})

const teamRef = computed(() => {
  if (props.kind !== 'team') return displayRef(props.card)
  const name = String(props.card?.label ?? props.card?.name ?? '').trim()
  const ref = displayRef(props.card)
  if (name && ref) return `${name} (${ref})`
  return name || ref
})

function normalizeEventTeamRow(row) {
  if (!row || typeof row !== 'object') return null
  const id = Number(row.id ?? row.rowid)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    id,
    ref: row.ref != null ? String(row.ref) : '',
    label: String(row.label ?? row.name ?? '').trim(),
    event: row.event ?? null,
  }
}

const linkedTeamsFallback = ref([])

async function loadLinkedTeamsFallback() {
  linkedTeamsFallback.value = []
  if (props.kind !== 'group') return
  const gid = Number(props.card?.id)
  if (!Number.isFinite(gid) || gid <= 0) return
  const fromCard = Array.isArray(props.card?.eventTeams)
    ? props.card.eventTeams.map(normalizeEventTeamRow).filter(Boolean)
    : []
  if (fromCard.length > 0) return
  try {
    const res = await listTeams()
    const rows = parseNodeListPayload(res)
    linkedTeamsFallback.value = rows
      .filter((t) => isFutureEnrollmentEntry(t) && Number(t.groupId) === gid)
      .map((t) => ({
        id: t.id,
        ref: t.ref ?? '',
        label: String(t.name ?? '').trim(),
        event: null,
      }))
  } catch {
    linkedTeamsFallback.value = []
  }
}

watch(
  () => [props.kind, props.card?.id, props.card?.eventTeams],
  () => {
    loadLinkedTeamsFallback()
  },
  { immediate: true, deep: true },
)

const eventTeams = computed(() => {
  const fromCard = Array.isArray(props.card?.eventTeams)
    ? props.card.eventTeams.map(normalizeEventTeamRow).filter(Boolean)
    : []
  if (fromCard.length > 0) return fromCard
  return linkedTeamsFallback.value
})

const parentGroupId = computed(() => {
  const pg = props.card?.parentGroup?.id ?? props.card?.groupId
  const id = Number(pg)
  return Number.isFinite(id) && id > 0 ? id : null
})

const showBanner = computed(() => {
  if (props.kind === 'group') {
    return eventTeams.value.length > 0
  }
  if (props.kind === 'team') {
    return isFutureProgram(props.card?.program) && parentGroupId.value != null
  }
  return false
})

function teamLinkLabel(et) {
  const ref = displayRef(et)
  const name = String(et?.label ?? '').trim()
  if (name && ref) return `${name} (${ref})`
  return name || ref || t('dashboard.team')
}
</script>

<template>
  <div v-if="showBanner" class="detail-enrollment-context-banner" role="note">
    <i class="bi bi-info-circle-fill detail-enrollment-context-banner-icon" aria-hidden="true"></i>
    <p class="detail-enrollment-context-banner-text">
      <template v-if="kind === 'group'">
        <I18nText
          k="groupDetail.enrollmentContextBannerGroup"
          :values="{ groupRef }"
        />
        {{ ' ' }}
        <I18nText k="groupDetail.enrollmentContextBannerGroupSuffix" />
        {{ ' ' }}
        <template v-for="(et, index) in eventTeams" :key="'et-link-' + et.id">
          <RouterLink
            class="detail-enrollment-context-banner-link"
            :to="{ name: 'team-detail', params: { id: et.id } }"
          >
            {{ teamLinkLabel(et) }}
          </RouterLink>
          <span v-if="index < eventTeams.length - 2">, </span>
          <span v-else-if="index === eventTeams.length - 2">
            <I18nText k="groupDetail.enrollmentContextBannerTeamListAnd" />
          </span>
        </template>
        <I18nText k="groupDetail.enrollmentContextBannerGroupEnd" />
      </template>
      <template v-else>
        <I18nText
          k="teamDetail.enrollmentContextBannerTeam"
          :values="{ teamRef: teamRef || displayRef(card) }"
        />
        {{ ' ' }}
        <I18nText k="teamDetail.enrollmentContextBannerTeamSuffix" />
        {{ ' ' }}
        <RouterLink
          class="detail-enrollment-context-banner-link"
          :to="{ name: 'group-detail', params: { id: parentGroupId } }"
        >
          <I18nText
            k="teamDetail.enrollmentContextBannerGroupLink"
            :values="{ groupRef: groupRef || `#${parentGroupId}` }"
          />
        </RouterLink>
        <I18nText k="teamDetail.enrollmentContextBannerTeamEnd" />
      </template>
    </p>
  </div>
</template>

<style scoped>
.detail-enrollment-context-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  margin: 0 0 1.25rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, var(--color-accent) 28%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent-soft) 65%, var(--color-bg));
}

.detail-enrollment-context-banner-icon {
  flex-shrink: 0;
  margin-top: 0.1rem;
  font-size: 1.1rem;
  color: var(--color-accent);
}

.detail-enrollment-context-banner-text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--color-text);
}

.detail-enrollment-context-banner-link {
  font-weight: 600;
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.detail-enrollment-context-banner-link:hover {
  color: color-mix(in srgb, var(--color-accent) 80%, var(--color-text));
}
</style>
