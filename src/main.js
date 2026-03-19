import 'bootstrap-icons/font/bootstrap-icons.css'
import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import { initTheme } from './theme'
import I18nText from './components/I18nText.vue'

initTheme()

const app = createApp(App)
app.component('I18nText', I18nText)
app.use(i18n)
app.use(router)
app.mount('#app')
