import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  MOBILE_MEDIA,
  COARSE_POINTER_MEDIA,
  matchMobileLayout,
} from '../utils/mobileViewport.js'

/** Reaktiv: Touch-primary und/oder Viewport unter 768px. */
export function useMobileLayout() {
  const isMobileLayout = ref(matchMobileLayout())
  let mqViewport = null
  let mqCoarse = null

  function sync() {
    isMobileLayout.value = matchMobileLayout()
  }

  onMounted(() => {
    mqViewport = window.matchMedia(MOBILE_MEDIA)
    mqCoarse = window.matchMedia(COARSE_POINTER_MEDIA)
    sync()
    mqViewport.addEventListener('change', sync)
    mqCoarse.addEventListener('change', sync)
  })

  onBeforeUnmount(() => {
    mqViewport?.removeEventListener('change', sync)
    mqCoarse?.removeEventListener('change', sync)
  })

  return { isMobileLayout }
}
