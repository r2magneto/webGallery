import { createApp } from 'vue'
import './cursorVars.js'
import './style.css'
import { initLenisSmoothScroll } from './lenisClient.js'
import App from './App.vue'

initLenisSmoothScroll()

createApp(App).mount('#app')
