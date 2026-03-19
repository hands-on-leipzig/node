<script setup>
import { RouterView } from 'vue-router'
import GithubExportBanner from '@/components/GithubExportBanner.vue'
import TranslationQuickEditModal from '@/components/TranslationQuickEditModal.vue'
</script>

<template>
  <GithubExportBanner />
  <RouterView />
  <TranslationQuickEditModal />
</template>

<style>
#app {
  min-height: 100vh;
}
</style>
