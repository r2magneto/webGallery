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

/** Hintergrund-Scroll sperren (z. B. Lightbox offen). */
export function stopLenisScroll() {
  lenisRef?.stop?.()
}

/** Hintergrund-Scroll wieder freigeben. */
export function startLenisScroll() {
  lenisRef?.start?.()
}

/** Dimensions neu messen (Bilder geladen, Fenstergröße, Layout). */
export function resizeLenis() {
  lenisRef?.resize?.()
}

let scheduleResizeRafA = 0
let scheduleResizeRafB = 0

/**
 * Lenis-Resize nach Layout-Commit (doppeltes rAF, kein Feuern mitten in Grid-Berechnung).
 */
export function scheduleResizeLenis() {
  if (scheduleResizeRafA) cancelAnimationFrame(scheduleResizeRafA)
  if (scheduleResizeRafB) cancelAnimationFrame(scheduleResizeRafB)
  scheduleResizeRafA = requestAnimationFrame(() => {
    scheduleResizeRafA = 0
    scheduleResizeRafB = requestAnimationFrame(() => {
      scheduleResizeRafB = 0
      resizeLenis()
    })
  })
}

export function cancelScheduledResizeLenis() {
  if (scheduleResizeRafA) {
    cancelAnimationFrame(scheduleResizeRafA)
    scheduleResizeRafA = 0
  }
  if (scheduleResizeRafB) {
    cancelAnimationFrame(scheduleResizeRafB)
    scheduleResizeRafB = 0
  }
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

/**
 * Ganz nach unten scrollen (Lenis-Smooth-Scroll oder natives smooth scrollTo).
 * @param {object} [options] Lenis scrollTo-Optionen; ohne `immediate` = weich.
 */
export function scrollWindowToBottom(options = {}) {
  const L = lenisRef
  if (L) {
    L.resize?.()
    const max = L.dimensions?.limit?.y ?? 0
    L.scrollTo(max, options)
    return
  }
  const top = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  )
  window.scrollTo({
    top,
    left: 0,
    behavior: options.immediate ? 'auto' : 'smooth',
  })
}

export function destroyLenisSmoothScroll() {
  if (!lenisRef) return
  lenisRef.destroy()
  lenisRef = null
}
