<script setup>
import { computed } from 'vue'
import { keycloak } from '@/auth/keycloak'
import AppSwitch from '@hands-on/glass/app-switch'
import logoJoin from '@/assets/JOIN_v1.0.png'

function roles() {
  const parsed = keycloak?.tokenParsed
  const list = [...(parsed?.realm_access?.roles || [])]
  const clients = parsed?.resource_access || {}
  for (const client of Object.values(clients)) {
    if (Array.isArray(client?.roles)) list.push(...client.roles)
  }
  return list.map((role) => String(role).toLowerCase())
}

function appUrl(name) {
  const host = window.location.hostname
  const tier = host.startsWith('dev.') ? 'dev.' : host.startsWith('test.') ? 'test.' : ''
  return `https://${tier}${name}.hands-on-technology.org`
}

const apps = computed(() => {
  const have = roles()
  const flow = have.some((role) => (
    role === 'flow_user'
    || role === 'flow-user'
    || role === 'flow_admin'
    || role === 'flow-admin'
    || role === 'flow-tester'
    || role === 'flow_tester'
  ))
  const wise = flow || have.some((role) => role.includes('scor') || role.includes('wise'))
  const hero = have.some((role) => role === 'hero-user' || role === 'hero_user' || role === 'hero_admin' || role === 'hero-admin')
  const items = [{ id: 'join', label: 'JOIN', href: '/dashboard', current: true, logo: logoJoin }]
  if (flow) {
    items.push({ id: 'flow', label: 'FLOW', href: appUrl('flow'), current: false, logo: `${appUrl('flow')}/flow/flow.png` })
  }
  if (wise) {
    items.push({ id: 'wise', label: 'WISE', href: `${appUrl('flow')}/scor`, current: false, logo: `${appUrl('flow')}/flow/wise.png` })
  }
  if (hero) {
    items.push({ id: 'hero', label: 'HERO', href: appUrl('hero'), current: false, logo: `${appUrl('flow')}/flow/hero.png` })
  }
  return items
})
</script>

<template>
  <AppSwitch :apps="apps" />
</template>
