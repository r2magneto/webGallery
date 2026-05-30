const DEFAULT_VIEWPORT =
  'width=device-width, initial-scale=1.0, viewport-fit=cover'

let savedViewportContent = null

/** Setzt Browser-Pinch-Zoom zurück (z. B. nach Zoom in der Thumbnail-Ansicht). */
export function resetViewportZoom() {
  if (typeof document === 'undefined') return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  if (savedViewportContent == null) {
    savedViewportContent = meta.getAttribute('content') || DEFAULT_VIEWPORT
  }
  meta.setAttribute(
    'content',
    `${DEFAULT_VIEWPORT}, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no`,
  )
  void document.documentElement.offsetHeight
}

export function restoreViewportZoom() {
  if (typeof document === 'undefined') return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta || savedViewportContent == null) return
  meta.setAttribute('content', savedViewportContent)
  savedViewportContent = null
  void document.documentElement.offsetHeight
}

function applyVisualViewportBox(el) {
  const vv = window.visualViewport
  if (!vv) {
    el.style.top = '0'
    el.style.left = '0'
    el.style.width = '100%'
    el.style.height = '100%'
    el.style.right = 'auto'
    el.style.bottom = 'auto'
    return
  }
  el.style.top = `${vv.offsetTop}px`
  el.style.left = `${vv.offsetLeft}px`
  el.style.width = `${vv.width}px`
  el.style.height = `${vv.height}px`
  el.style.right = 'auto'
  el.style.bottom = 'auto'
}

let boundEl = null
let onVisualViewportChange = null

/** Lightbox-Overlay an den sichtbaren Viewport koppeln (nach Pinch-Zoom). */
export function bindOverlayToVisualViewport(el) {
  if (typeof window === 'undefined' || !el) return
  unbindOverlayFromVisualViewport()
  boundEl = el
  applyVisualViewportBox(el)
  onVisualViewportChange = () => {
    if (boundEl) applyVisualViewportBox(boundEl)
  }
  window.visualViewport?.addEventListener('resize', onVisualViewportChange)
  window.visualViewport?.addEventListener('scroll', onVisualViewportChange)
}

export function unbindOverlayFromVisualViewport() {
  if (boundEl) {
    boundEl.style.top = ''
    boundEl.style.left = ''
    boundEl.style.width = ''
    boundEl.style.height = ''
    boundEl.style.right = ''
    boundEl.style.bottom = ''
  }
  if (onVisualViewportChange) {
    window.visualViewport?.removeEventListener('resize', onVisualViewportChange)
    window.visualViewport?.removeEventListener('scroll', onVisualViewportChange)
  }
  boundEl = null
  onVisualViewportChange = null
}
