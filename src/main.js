import { createApp } from 'vue'
import './style.css'
import { initLenisSmoothScroll } from './lenisClient.js'
import { ensureProjectHeaderDefaultsLoaded } from './utils/headerColorConfig.js'
import { ensureProjectRefAboutDefaultsLoaded } from './utils/refAboutColorConfig.js'
import App from './App.vue'

initLenisSmoothScroll()

async function bootstrap() {
  // Farb-JSONs müssen in localStorage stehen, bevor Header/Ref-About rendern.
  await Promise.all([
    ensureProjectHeaderDefaultsLoaded(),
    ensureProjectRefAboutDefaultsLoaded(),
  ])
  createApp(App).mount('#app')
}

bootstrap()
