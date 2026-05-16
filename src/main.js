import { createApp } from 'vue'
import './cursorVars.js'
import './style.css'
import { initLenisSmoothScroll } from './lenisClient.js'
import { ensureProjectHeaderDefaultsLoaded } from './utils/headerColorConfig.js'
import { ensureProjectRefAboutDefaultsLoaded } from './utils/refAboutColorConfig.js'
import App from './App.vue'

initLenisSmoothScroll()

// Project-wide defaults (public/header-colors.json) → localStorage baseline.
ensureProjectHeaderDefaultsLoaded()
ensureProjectRefAboutDefaultsLoaded()

createApp(App).mount('#app')
