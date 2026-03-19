<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { hasAdminRole } from '@/auth/keycloak'
import { showGithubExportBanner, dismissGithubExportBanner } from '@/utils/translationExportReminder'
import { countLocaleDraftKeys, localeDraftRevision } from '@/utils/localeDrafts'

const { t } = useI18n()

const visible = computed(() => {
  void localeDraftRevision.value
  if (!hasAdminRole() || !showGithubExportBanner.value) return false
  return countLocaleDraftKeys('en') + countLocaleDraftKeys('de') > 0
})
</script>

<template>
  <div v-if="visible" class="github-export-banner" role="status">
    <div class="github-export-banner-inner">
      <i class="bi bi-github" aria-hidden="true" />
      <p class="github-export-banner-text">{{ t('common.githubExportBannerText') }}</p>
      <RouterLink class="github-export-banner-link" :to="{ name: 'admin-translations' }" @click="dismissGithubExportBanner">
        {{ t('common.githubExportBannerCta') }}
      </RouterLink>
      <button type="button" class="github-export-banner-dismiss" @click="dismissGithubExportBanner">
        {{ t('common.githubExportBannerDismiss') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.github-export-banner {
  position: sticky;
  top: 0;
  z-index: 90;
  background: linear-gradient(135deg, #1a1f2e 0%, #2d3548 100%);
  color: #e9ecef;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}
.github-export-banner-inner {
  max-width: 72rem;
  margin: 0 auto;
  padding: 0.55rem 1rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem 1rem;
  font-size: 0.875rem;
}
.github-export-banner-inner .bi-github {
  font-size: 1.15rem;
  opacity: 0.9;
}
.github-export-banner-text {
  margin: 0;
  flex: 1;
  min-width: 12rem;
  line-height: 1.4;
}
.github-export-banner-link {
  color: #7eb8ff;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.github-export-banner-link:hover {
  text-decoration: underline;
  color: #b6d4fe;
}
.github-export-banner-dismiss {
  margin-left: auto;
  padding: 0.35rem 0.65rem;
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: transparent;
  color: #ced4da;
  border-radius: 0.35rem;
  cursor: pointer;
}
.github-export-banner-dismiss:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
</style>
