import Lenis from 'lenis'

let lenisRef = null

/**
 * Globales Smooth-Scrolling (Wheel / Trackpad / Touch) — eine Instanz für die ganze App.
 * @see https://github.com/darkroomengineering/lenis
 */
export function initLenisSmoothScroll() {
  if (lenisRef) return lenisRef

  lenisRef = new Lenis({
    smoothWheel: true,
    /** niedrigeres lerp = längeres, weicheres Auslaufen nach Wheel (~≈1 s Gefühl) */
    lerp: 0.038,
    wheelMultiplier: 1,
    touchMultiplier: 1,
    gestureOrientation: 'vertical',
    infinite: false,
    autoResize: true,
    autoRaf: true,
  })

  return lenisRef
}

export function getLenis() {
  return lenisRef
}

/** Dimensions neu messen (Bilder geladen, Fenstergröße, Layout). */
export function resizeLenis() {
  lenisRef?.resize?.()
}

/**
 * Vertikales Scrollen — nutzt Lenis, falls aktiv, sonst natives window.scrollTo.
 * @param {number} y
 * @param {object} [options] Lenis scrollTo-Optionen (z. B. `{ immediate: true }`)
 */
export function scrollWindowToY(y, options = {}) {
  const L = lenisRef
  const top = Math.max(0, y)
  if (L) {
    L.scrollTo(top, options)
  } else {
    window.scrollTo(0, top)
  }
}

export function destroyLenisSmoothScroll() {
  if (!lenisRef) return
  lenisRef.destroy()
  lenisRef = null
}
