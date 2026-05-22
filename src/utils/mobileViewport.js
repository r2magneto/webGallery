/** Smartphones / Tablets: Breite unter 768px (Desktop unverändert). */
export const MOBILE_MEDIA = '(max-width: 767px)'

/** Touch-primary Geräte (Finger, nicht feine Maus). */
export const COARSE_POINTER_MEDIA = '(pointer: coarse)'

export function matchMobileViewport() {
  if (typeof window === 'undefined') return false
  return window.matchMedia(MOBILE_MEDIA).matches
}

export function matchCoarsePointer() {
  if (typeof window === 'undefined') return false
  return window.matchMedia(COARSE_POINTER_MEDIA).matches
}

/** Lightbox-Swipe: schmales Viewport und/oder Touch-Eingabe. */
export function matchMobileTouchNav() {
  return matchMobileViewport() || matchCoarsePointer()
}

/**
 * Mobiles Layout: Touch-primary (auch Querformat) oder schmaler Viewport.
 * Primär `(pointer: coarse)`, zusätzlich max-width für schmale Desktop-Fenster.
 */
export function matchMobileLayout() {
  return matchCoarsePointer() || matchMobileViewport()
}
