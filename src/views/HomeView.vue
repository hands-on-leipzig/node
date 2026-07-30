<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { isAuthenticated, login, logout, getUserProfile, hasAdminRole } from '@/auth/keycloak'
import {
  setLocaleUserChoice,
  showTranslationKeys,
  setShowTranslationKeys,
  translationEditMode,
  setTranslationEditMode,
} from '@/i18n'
import { theme, setTheme } from '@/theme'
import logoJoin from '@/assets/JOIN_v1.0.png'
import logoHot from '@/assets/hot.png'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const user = computed(() => getUserProfile())
const authenticated = computed(() => isAuthenticated())
const showForbidden = computed(() => !!route.query.forbidden && authenticated.value)

function goDashboard() {
  router.push({ name: 'dashboard' })
}

function doLogin() {
  login()
}
</script>

<template>
  <div class="home">
    <div class="home-settings">
      <div class="home-theme">
        <button
          type="button"
          class="icon-btn"
          :class="{ active: theme === 'light' }"
          @click="setTheme('light')"
          :title="t('common.light')"
          :aria-label="t('common.light')"
          :aria-pressed="theme === 'light'"
        >
          <i class="bi bi-sun-fill"></i>
        </button>
        <button
          type="button"
          class="icon-btn"
          :class="{ active: theme === 'dark' }"
          @click="setTheme('dark')"
          :title="t('common.dark')"
          :aria-label="t('common.dark')"
          :aria-pressed="theme === 'dark'"
        >
          <i class="bi bi-moon-fill"></i>
        </button>
      </div>
      <div class="home-lang">
        <button
          type="button"
          class="pill-btn"
          :class="{ active: locale === 'de' }"
          :aria-label="t('common.german')"
          :aria-pressed="locale === 'de'"
          @click="setLocaleUserChoice('de')"
        >
          DE
        </button>
        <button
          type="button"
          class="pill-btn"
          :class="{ active: locale === 'en' }"
          :aria-label="t('common.english')"
          :aria-pressed="locale === 'en'"
          @click="setLocaleUserChoice('en')"
        >
          EN
        </button>
      </div>
      <div class="home-keys">
        <button
          type="button"
          class="pill-btn"
          :class="{ active: showTranslationKeys }"
          @click="setShowTranslationKeys(!showTranslationKeys)"
          :title="t('common.showTranslationKeys')"
        >
          <i class="bi" :class="showTranslationKeys ? 'bi-code-slash' : 'bi-translate'"></i>
          {{ showTranslationKeys ? 'Keys' : 'Text' }}
        </button>
      </div>
    </div>
    <div class="hero">
      <div class="hero-glow" aria-hidden="true"></div>
      <div class="hero-logo">
        <img :src="logoJoin" alt="JOIN" class="logo-img logo-img--join" />
      </div>
      <p class="hero-partner">
        <span class="hero-partner-label"><I18nText k="common.organizedBy" /></span>
        <a
          href="https://www.hands-on-technology.org"
          target="_blank"
          rel="noopener noreferrer"
          class="hero-partner-link"
        >
          <img :src="logoHot" alt="HANDS on TECHNOLOGY" class="hero-partner-logo" />
        </a>
      </p>
      <h1><I18nText k="common.appName" /></h1>
      <p class="tagline"><I18nText k="home.tagline" /></p>
      <div class="actions">
        <div v-if="showForbidden" class="forbidden-message">
          <p><i class="bi bi-shield-exclamation"></i> <I18nText k="auth.forbiddenMessage" /></p>
          <button type="button" class="btn btn-secondary" @click="logout">
            <I18nText k="auth.logout" />
          </button>
        </div>
        <template v-else-if="authenticated">
          <p class="welcome">
            <I18nText k="home.welcome" :values="{ name: user?.name || t('common.coach') }" />
          </p>
          <button class="btn btn-primary" @click="goDashboard">
            <i class="bi bi-speedometer2"></i>
            <I18nText k="home.goToDashboard" />
          </button>
        </template>
        <template v-else>
          <button class="btn btn-primary" @click="doLogin">
            <i class="bi bi-box-arrow-in-right"></i>
            <I18nText k="home.signInWithSso" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  position: relative;
  background: transparent;
}
.home-settings {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: var(--radius-xl);
  border: 1px solid var(--liquid-border);
  background: var(--liquid-tile-bg-strong);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  box-shadow: var(--liquid-shadow);
}
.icon-btn {
  width: var(--touch-lg);
  height: var(--touch-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--liquid-border-soft);
  border-radius: var(--radius-lg);
  background: var(--liquid-bg-subtle);
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 1.25rem;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
  box-shadow: none;
}
.icon-btn:hover {
  color: var(--color-text);
  background: var(--liquid-bg);
  border-color: var(--liquid-border);
}
.icon-btn.active {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}
.pill-btn {
  padding: 0.4rem 0.75rem;
  min-height: var(--touch);
  font-size: var(--text-sm);
  font-weight: 600;
  border: 1px solid var(--liquid-border-soft);
  border-radius: var(--radius-full);
  background: var(--liquid-bg-subtle);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
  box-shadow: none;
}
.pill-btn:hover {
  color: var(--color-text);
  background: var(--liquid-bg);
  border-color: var(--liquid-border);
}
.pill-btn.active {
  color: white;
  background: var(--color-accent);
}
.hero {
  text-align: center;
  max-width: 28rem;
  width: 100%;
  position: relative;
  padding: 2.25rem 1.75rem 2rem;
  border-radius: var(--radius-xl);
  border: 1px solid var(--liquid-border);
  background: var(--liquid-tile-bg-strong);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  box-shadow: var(--liquid-shadow);
}
.hero-glow {
  position: absolute;
  top: -40%;
  left: 50%;
  transform: translateX(-50%);
  width: 120%;
  max-width: 24rem;
  height: 18rem;
  background: radial-gradient(ellipse 80% 70% at 50% 50%, var(--color-accent-soft) 0%, transparent 70%);
  pointer-events: none;
}
.hero-logo {
  position: relative;
  margin-bottom: 1rem;
}
.hero-logo .logo-img {
  height: 4rem;
  width: auto;
  display: block;
  object-fit: contain;
}
.hero-logo .logo-img--join {
  height: 3.25rem;
  max-width: min(16rem, 88vw);
  margin: 0 auto;
}
.hero-partner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  margin: -0.35rem 0 1.25rem;
}
.hero-partner-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-subtle);
}
.hero-partner-link {
  display: block;
  line-height: 0;
}
.hero-partner-logo {
  height: 1.85rem;
  width: auto;
  object-fit: contain;
  opacity: 0.9;
}
.hero-partner-link:hover .hero-partner-logo {
  opacity: 1;
}
.hero h1 {
  font-size: var(--text-4xl);
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 0.5rem;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.tagline {
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  margin-bottom: 2rem;
  line-height: 1.55;
}
.welcome {
  font-size: var(--text-lg);
  margin-bottom: 1.25rem;
  color: var(--color-text);
}
.actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 1rem;
  width: 100%;
}
.btn {
  padding: 1rem 1.5rem;
  min-height: var(--touch-lg);
  border-radius: var(--radius-lg);
  font-size: var(--text-lg);
  font-weight: 600;
  cursor: pointer;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: transform 0.15s, box-shadow 0.15s;
}
.btn .bi {
  font-size: 1.25rem;
}
.btn-primary {
  background: var(--color-accent);
  color: white;
  box-shadow: 0 4px 14px rgba(255, 122, 0, 0.35);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 122, 0, 0.4);
}
html[data-theme='dark'] .btn-primary {
  box-shadow: 0 4px 14px rgba(255, 159, 77, 0.3);
}
html[data-theme='dark'] .btn-primary:hover {
  box-shadow: 0 6px 20px rgba(255, 159, 77, 0.4);
}
.forbidden-message {
  text-align: center;
  padding: 1rem;
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.48)) saturate(calc(var(--liquid-saturate) * 0.9));
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.48)) saturate(calc(var(--liquid-saturate) * 0.9));
  border-radius: var(--radius-xl);
  border: 1px solid var(--liquid-border);
  box-shadow: var(--liquid-shadow);
}
.forbidden-message p {
  margin: 0 0 1rem;
  color: var(--color-text);
  font-size: var(--text-lg);
}
.forbidden-message .bi {
  margin-right: 0.35rem;
  color: var(--color-accent);
}
.btn-secondary {
  background: var(--color-bg-muted);
  color: var(--color-text);
}
.btn-secondary:hover {
  background: var(--color-bg-hover);
}
</style>
