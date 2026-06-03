<script setup>
import {
  ref,
  computed,
  reactive,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from 'vue'
import { GridLayout, GridItem } from 'vue-grid-layout-v3'
import { fetchGalleryLayoutItems } from '../apiConfig.js'
import { resolveGalleryImageSrc } from '../config/galleryPaths.js'
import {
  getLenis,
  scheduleResizeLenis,
  cancelScheduledResizeLenis,
  scrollWindowToY,
  stopLenisScroll,
  startLenisScroll,
} from '../lenisClient.js'
import {
  squareRowHeightPx,
  tileContainerAspectStyle,
} from '../utils/gridAspect.js'
import { createGridHostWidthObserver } from '../utils/gridHostResize.js'
import GalleryScrollbar from './GalleryScrollbar.vue'
import { useGasPedalScroll } from '../composables/useGasPedalScroll.js'
import { useMobileLayout } from '../composables/useMobileLayout.js'
import {
  resetViewportZoom,
  restoreViewportZoom,
  bindOverlayToVisualViewport,
  unbindOverlayFromVisualViewport,
} from '../utils/viewportZoom.js'

const props = defineProps({
  /** Layout-JSON im public-Ordner (z. B. layout.json). */
  configPath: {
    type: String,
    default: 'layout.json',
  },
})

const { isMobileLayout } = useMobileLayout()

/** Querformat-Erkennung (nur für die mobile Steuerung relevant). */
const isLandscape = ref(false)
let orientationMq = null

function syncOrientation() {
  isLandscape.value =
    typeof window !== 'undefined'
      ? window.matchMedia('(orientation: landscape)').matches
      : false
}

const isMobilePortrait = computed(() => isMobileLayout.value && !isLandscape.value)
const isMobileLandscape = computed(() => isMobileLayout.value && isLandscape.value)

/** Infotext im Mobil-Landscape standardmäßig an; per Info-Button einklappbar. */
const infoVisible = ref(true)

function toggleInfo() {
  infoVisible.value = !infoVisible.value
}

/** Mobil-Icons liegen wie die Cursor-Grafiken in public/assets (relative Base). */
function iconUrl(name) {
  return `${import.meta.env.BASE_URL}assets/${name}`
}

const LB_NAV_ICON_FILES = [
  'left.png',
  'right.png',
  'close.png',
  'infoon.png',
  'infooff.png',
]

function preloadLbNavIcons() {
  for (const name of LB_NAV_ICON_FILES) {
    const im = new Image()
    im.decoding = 'async'
    im.src = iconUrl(name)
  }
}

/** Rahmen-Seitenverhältnis pro Slide — eingefroren ab Proxy/Thumbnail. */
const lbAspectLock = ref(null)

function clearLbAspectLock() {
  lbAspectLock.value = null
}

function setLbAspectLock(index, w, h) {
  if (index == null || w <= 0 || h <= 0) return
  lbAspectLock.value = { index, w, h }
}

function dimensionsForLightbox(index, src) {
  const lock = lbAspectLock.value
  if (lock && lock.index === index && lock.w > 0 && lock.h > 0) {
    return { w: lock.w, h: lock.h }
  }
  const dim = src ? naturalBySrc[src] : null
  if (dim?.w > 0 && dim?.h > 0) return { w: dim.w, h: dim.h }
  return { w: 1600, h: 900 }
}

/**
 * Festes Box-Modell der Vollansicht (statt proportionaler Bänder):
 * Gelber Rahmen = Bild + fixer 10px-Abstand (oben/links/rechts).
 * Mit Infotext: Bild → 10px → Text (linksbündig) → 10px → Rahmen-Unterkante.
 */
const LB_FRAME_PAD = 10
const LB_CAPTION_GAP = 10
/** Gelbe Outline in der Vollansicht (Morph-Ende = Lightbox) */
const LB_FULL_OUTLINE_PX = 1
const LB_VIEWPORT_W_FRAC = 0.94
const LB_VIEWPORT_H_FRAC = 0.88
const LB_MOBILE_EDGE_INSET = 8

/**
 * Vertikale Reserven (px) für die Vollansicht, je nach Modus. Sie definieren das
 * Band, in dem der Rahmen zentriert wird, und müssen mit den CSS-Paddings der
 * Overlay übereinstimmen (siehe `.lb-overlay--portrait` / `--landscape`).
 *
 * - Desktop: symmetrisch aus LB_VIEWPORT_H_FRAC → ~88 % nutzbar.
 * - Mobil: nur ein kleiner Displayrand; Icons liegen als Overlay über dem Bild,
 *   damit die Vollansicht die Bildschirmfläche maximal nutzen kann.
 */
const LB_PORTRAIT_INSET_TOP = LB_MOBILE_EDGE_INSET
const LB_PORTRAIT_INSET_BOTTOM = LB_MOBILE_EDGE_INSET
const LB_PORTRAIT_INSET_SIDE = 12
const LB_LANDSCAPE_INSET_TOP = 12
const LB_LANDSCAPE_INSET_BOTTOM = 12
const LB_LANDSCAPE_INSET_SIDE = 12

const infoIconName = computed(() =>
  infoVisible.value ? 'infoon.png' : 'infooff.png',
)
const infoIconSrc = computed(() => iconUrl(infoIconName.value))

function lbInsets() {
  if (isMobileLandscape.value) {
    return {
      top: LB_LANDSCAPE_INSET_TOP,
      bottom: LB_LANDSCAPE_INSET_BOTTOM,
      left: LB_LANDSCAPE_INSET_SIDE,
      right: LB_LANDSCAPE_INSET_SIDE,
    }
  }
  if (isMobilePortrait.value) {
    return {
      top: LB_PORTRAIT_INSET_TOP,
      bottom: LB_PORTRAIT_INSET_BOTTOM,
      left: LB_PORTRAIT_INSET_SIDE,
      right: LB_PORTRAIT_INSET_SIDE,
    }
  }
  const my =
    typeof window !== 'undefined'
      ? (window.innerHeight * (1 - LB_VIEWPORT_H_FRAC)) / 2
      : 0
  const mx =
    typeof window !== 'undefined'
      ? (window.innerWidth * (1 - LB_VIEWPORT_W_FRAC)) / 2
      : 0
  return { top: my, bottom: my, left: mx, right: mx }
}

/** Morph: kurz, knackig, leichter Bounce beim Aufzoomen */
const SPRING_OPEN = 'cubic-bezier(0.30, 1.1, 0.42, 1)'
const MORPH_MS_OPEN = 380

/** Morph zu / Overlay-Aus: dezent */
const SPRING_CLOSE = 'cubic-bezier(0.36, 1.06, 0.52, 1)'
const MORPH_MS_CLOSE = 420
/** Letzte Phase Schließen: Morph + Rahmen + Backdrop gleichzeitig ausblenden */
const MORPH_CLOSE_FADE_MS = 170

/** Kachel-Hover (Zoom) */
const TILE_SPRING = 'cubic-bezier(0.36, 1.06, 0.52, 1)'

const layout = ref([])
const loadState = ref('loading')
const revealTiles = ref(false)

const viewerRootRef = ref(null)
const gridHostRef = ref(null)
const gridHostWidth = ref(0)

const gridRowHeight = computed(() =>
  squareRowHeightPx(gridHostWidth.value || 960),
)

/**
 * vue-grid-layout aktualisiert bei rowHeight-Wechsel die Items, ruft aber nicht immer
 * die Container-Höhen-Neuberechnung auf (nur bei Breite/Margin). Window-resize triggert das.
 */
function nudgeVueGridLayoutRemeasure() {
  window.dispatchEvent(new Event('resize'))
}

function notifyLenisAfterGridSettled() {
  nextTick(() => {
    nudgeVueGridLayoutRemeasure()
    scheduleResizeLenis()
  })
}

let gridLayoutHeightObserver = null

function bindGridLayoutHeightObserver() {
  gridLayoutHeightObserver?.disconnect()
  gridLayoutHeightObserver = null
  const gridEl = gridHostRef.value?.querySelector('.vue-grid-layout')
  if (!gridEl || typeof ResizeObserver === 'undefined') return
  gridLayoutHeightObserver = new ResizeObserver(() => {
    scheduleResizeLenis()
  })
  gridLayoutHeightObserver.observe(gridEl)
}

function onGridLayoutReady() {
  nudgeVueGridLayoutRemeasure()
  notifyLenisAfterGridSettled()
  bindGridLayoutHeightObserver()
}

const gridHostWidthObserver = createGridHostWidthObserver({
  onWidthChange(w) {
    gridHostWidth.value = w
    notifyLenisAfterGridSettled()
  },
})

function bindGridHostResizeObserver() {
  const el = gridHostRef.value
  if (!el) return
  gridHostWidthObserver.bind(el, el.offsetWidth)
  nextTick(() => bindGridLayoutHeightObserver())
}

function tileMediaStyle(item) {
  return tileContainerAspectStyle(
    item,
    gridHostWidth.value || 960,
    gridRowHeight.value,
  )
}

/** null = zu */
const lightboxIndex = ref(null)
/** idle | opening | viewing | closing */
const viewerMode = ref('idle')

const morphSrc = ref('')
/**
 * Performance: Vollansicht zeigt zwei gestapelte Ebenen – unten das gecachte
 * Proxy (1024px, sofort scharf), oben das High-Res (2048px), das erst beim
 * Öffnen lädt und nach `@load` weich eingeblendet wird.
 */
const isHighResLoaded = ref(false)
const morphShellStyle = ref({})
const morphInnerObjectFit = ref('cover')
/** Reserviert die Textzeile im Morph (gleiche Höhe wie in der Vollansicht) */
const morphCaptionReserve = ref(false)
/** Höhe der reservierten Textzeile in px (gemessen) */
const morphCaptionH = ref(0)
/** Textsichtbarkeit (Höhe bleibt reserviert, auch wenn ausgeblendet) */
const morphShowCaption = ref(false)
const morphCaptionText = ref('')
const morphInnerTransition = ref('none')
const lbContentWrapRef = ref(null)
const lbOverlayRef = ref(null)
const morphShellRef = ref(null)
const morphImgRef = ref(null)

/** Aktuelles, deterministisch berechnetes Box-Layout der Vollansicht. */
const lbLayout = ref(null)

/** src → { w, h } für sofortige Lightbox-Rahmengröße ohne Layout-Sprung */
const naturalBySrc = reactive({})

let morphFinishTimer = null
let morphCloseFadeTimer = null

const morphShellOpacity = ref(1)
const lbBackdropOpacity = ref(1)
/** Kurzes Ausblenden der Caption vor dem Zoom-Back (kein Flimmern übers Grid) */
const lbCaptionFastHide = ref(false)
let captionFadeBeforeCloseTimer = null

function clearCaptionFadeBeforeCloseTimer() {
  if (captionFadeBeforeCloseTimer != null) {
    clearTimeout(captionFadeBeforeCloseTimer)
    captionFadeBeforeCloseTimer = null
  }
}

function roundRectPx(r) {
  if (!r) return null
  return {
    top: Math.round(r.top),
    left: Math.round(r.left),
    width: Math.max(1, Math.round(r.width)),
    height: Math.max(1, Math.round(r.height)),
  }
}

function clearMorphCloseFadeTimer() {
  if (morphCloseFadeTimer != null) {
    clearTimeout(morphCloseFadeTimer)
    morphCloseFadeTimer = null
  }
}

const currentLightboxSrc = computed(() => {
  const i = lightboxIndex.value
  if (i === null || i < 0 || i >= layout.value.length) return ''
  return layout.value[i]?.src ?? ''
})

/**
 * Leitet den Proxy-Pfad (1024px) aus dem High-Res-Original ab, indem direkt vor
 * der Dateiendung `_proxy` eingefügt wird – z.B. `…/bild.webp` → `…/bild_proxy.webp`.
 * Query/Hash bleiben erhalten. Umkehrung: Original = Proxy ohne `_proxy`.
 */
function toProxySrc(src) {
  if (!src) return src
  return src.replace(/(\.[^./?#]+)([?#].*)?$/i, '_proxy$1$2')
}

/** Proxy-Quelle des aktuell gezeigten Bildes (gecached aus der Thumbnail-Liste). */
const currentLightboxProxySrc = computed(() => toProxySrc(currentLightboxSrc.value))

/** High-Res nur einblenden — Proxy/Thumbnail tragen das feste Rahmen-Layout. */
function onHighResLoad() {
  isHighResLoaded.value = true
}

/** Rohtext inkl. Zeilenumbrüche (Anzeige); leer nur wenn trim() leer */
const currentLightboxCaptionRaw = computed(() => {
  const i = lightboxIndex.value
  if (i === null || i < 0 || i >= layout.value.length) return ''
  const v = layout.value[i]?.caption
  return v != null ? String(v) : ''
})

function lightboxCaptionRawForItem(item) {
  const v = item?.caption
  return v != null ? String(v) : ''
}

/**
 * Soll der Infotext im gelben Rahmen Platz bekommen?
 * - Desktop & Mobil-Portrait: ja (sofern vorhanden).
 * - Mobil-Landscape: nur wenn der Info-Button aktiv ist.
 */
function isCaptionInFrame(index) {
  const item = layout.value[index]
  if (lightboxCaptionRawForItem(item).trim() === '') return false
  if (isMobileLandscape.value) return infoVisible.value
  return true
}

/** Caption-Anzeige für den aktuellen Index (Template). */
const captionInFrame = computed(() => {
  if (lightboxIndex.value == null) return false
  return isCaptionInFrame(lightboxIndex.value)
})

function clearMorphTimer() {
  if (morphFinishTimer != null) {
    clearTimeout(morphFinishTimer)
    morphFinishTimer = null
  }
}

function escapeAttrSelectorValue(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const gridShellRef = ref(null)

/**
 * Lightbox ↔ Grid: aktives Thumbnail im Hintergrund sanft im Viewport halten.
 *
 * Während der Vollansicht ist Lenis gestoppt (Hintergrund-Scroll gesperrt), darum
 * `force: true`, damit der Programm-Scroll trotzdem läuft. Es wird nur so weit
 * gescrollt, dass die aktive Kachel mit Sicherheitsrand sichtbar wird – ist sie
 * bereits komplett im Bild, passiert nichts (unauffällig). So trifft der Zoom-Back
 * beim Schließen immer eine sichtbare Kachel und springt nicht zum Bildschirmrand.
 */
/**
 * Liefert die Ziel-Scrollposition (Y), bei der die aktive Kachel mit
 * Sicherheitsrand sichtbar ist – oder null, wenn sie bereits komplett im Bild
 * ist bzw. nicht gefunden wurde.
 */
function activeThumbnailTargetY(index) {
  if (index == null || index < 0 || index >= layout.value.length) return null
  const id = layout.value[index]?.i
  if (id == null) return null
  const el = document.querySelector(
    `[data-viewer-tile-id="${escapeAttrSelectorValue(id)}"]`,
  )
  if (!(el instanceof HTMLElement)) return null
  const r = el.getBoundingClientRect()
  if (r.height <= 0 && r.width <= 0) return null

  const vh = window.innerHeight
  const margin = Math.min(vh * 0.12, 96)
  let delta = 0

  if (r.height >= vh - 2 * margin) {
    // Kachel höher als der sichtbare Bereich → mittig setzen.
    delta = r.top + r.height / 2 - vh / 2
  } else if (r.top < margin) {
    delta = r.top - margin
  } else if (r.bottom > vh - margin) {
    delta = r.bottom - (vh - margin)
  } else {
    return null
  }
  return Math.max(0, window.scrollY + delta)
}

function scrollActiveThumbnailIntoView(index) {
  const target = activeThumbnailTargetY(index)
  if (target == null) return
  scrollWindowToY(target, {
    force: true,
    duration: 0.9,
    easing: (t) => 1 - (1 - t) ** 3,
  })
}

/**
 * Sofort (synchron, ohne Animation) zur aktiven Kachel scrollen – für den
 * Moment des Schließens, damit der Zoom-Zurück die Kachel an korrekter Position
 * trifft. Auf Mobil wird während des Blätterns NICHT gescrollt (siehe Watch),
 * deshalb holen wir die Synchronisation hier einmalig nach.
 */
function syncActiveThumbnailInstant(index) {
  const target = activeThumbnailTargetY(index)
  if (target == null) return
  // Nativ + synchron → getBoundingClientRect direkt danach ist korrekt.
  window.scrollTo(0, target)
  // Lenis-Zielwert angleichen, damit es nach dem Start nicht zurückspringt.
  scrollWindowToY(target, { force: true, immediate: true })
}

function fitContain(nw, nh, maxW, maxH) {
  if (nw <= 0 || nh <= 0) return { w: maxW * 0.5, h: maxH * 0.5 }
  const r = nw / nh
  let w = maxW
  let h = w / r
  if (h > maxH) {
    h = maxH
    w = h * r
  }
  return { w, h }
}

function morphTimingMs(kind) {
  return kind === 'open' ? MORPH_MS_OPEN : MORPH_MS_CLOSE
}

function morphSpring(kind) {
  return kind === 'open' ? SPRING_OPEN : SPRING_CLOSE
}

function clearMorphShell() {
  clearMorphCloseFadeTimer()
  clearCaptionFadeBeforeCloseTimer()
  lbCaptionFastHide.value = false
  morphShellStyle.value = {}
  morphShowCaption.value = false
  morphCaptionReserve.value = false
  morphCaptionH.value = 0
  morphCaptionText.value = ''
  morphInnerObjectFit.value = 'cover'
  morphInnerTransition.value = 'none'
  morphShellOpacity.value = 1
  lbBackdropOpacity.value = 1
}

function setMorphShell(
  r,
  {
    withTransition = false,
    morphKind = 'open',
    outlinePx = 4,
    showCaption = false,
    captionReserve = false,
    captionH = 0,
    captionText = '',
    objectFit = 'cover',
    appendCloseOpacityFade = false,
  } = {},
) {
  if (!r) return
  morphShowCaption.value = showCaption
  morphCaptionReserve.value = captionReserve
  morphCaptionH.value = captionH
  morphCaptionText.value = captionText
  morphInnerObjectFit.value = objectFit
  const ms = morphTimingMs(morphKind)
  const spring = morphSpring(morphKind)
  const tParts = withTransition
    ? [
        `top ${ms}ms ${spring}`,
        `left ${ms}ms ${spring}`,
        `width ${ms}ms ${spring}`,
        `height ${ms}ms ${spring}`,
        ...(morphKind === 'close' ? [`outline-width ${ms}ms ${spring}`] : []),
      ]
    : []
  if (appendCloseOpacityFade) {
    tParts.push(`opacity ${MORPH_CLOSE_FADE_MS}ms ease-out`)
  }
  const t = tParts.length ? tParts.join(', ') : 'none'
  morphInnerTransition.value = withTransition
    ? `object-fit ${ms}ms ${spring}`
    : 'none'
  morphShellStyle.value = {
    position: 'fixed',
    top: `${r.top}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    zIndex: '290',
    overflow: 'hidden',
    outlineStyle: 'solid',
    outlineColor: '#facc15',
    outlineWidth: `${outlinePx}px`,
    outlineOffset: '0',
    boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.5)',
    transition: t,
    pointerEvents: 'none',
    boxSizing: 'border-box',
    borderRadius: '0',
  }
}

function prefetchNatural(src) {
  if (!src || naturalBySrc[src]) return
  const im = new Image()
  im.onload = () => {
    // Proxy und High-Res haben dasselbe Seitenverhältnis → fürs Box-Modell
    // reicht das gecachte, datensparsame Proxy. Schlüssel bleibt das Original.
    if (im.naturalWidth > 0 && im.naturalHeight > 0 && !naturalBySrc[src]) {
      naturalBySrc[src] = { w: im.naturalWidth, h: im.naturalHeight }
    }
  }
  im.src = toProxySrc(src)
}

function onLightboxImgLoad(e) {
  const el = e.target
  if (!el?.naturalWidth || !el?.naturalHeight) return
  const idx = lightboxIndex.value
  const key = currentLightboxSrc.value
  if (idx == null || !key) return
  if (lbAspectLock.value?.index === idx) return
  if (!naturalBySrc[key]) {
    naturalBySrc[key] = { w: el.naturalWidth, h: el.naturalHeight }
  }
  setLbAspectLock(idx, el.naturalWidth, el.naturalHeight)
  recomputeLbLayout()
}

/**
 * Misst die Texthöhe der Caption bei gegebener Innenbreite (px), mit denselben
 * Typo-Werten wie `.lb-caption-inner`. Nötig, damit der Rahmen die Textzeile
 * exakt einplanen kann (festes Box-Modell statt geschätzter Proportionen).
 */
let captionMeasureEl = null

function measureCaptionHeight(text, widthPx) {
  if (!text || widthPx <= 0 || typeof document === 'undefined') return 0
  if (!captionMeasureEl) {
    captionMeasureEl = document.createElement('div')
    captionMeasureEl.setAttribute('aria-hidden', 'true')
    const s = captionMeasureEl.style
    s.position = 'fixed'
    s.left = '-99999px'
    s.top = '0'
    s.visibility = 'hidden'
    s.pointerEvents = 'none'
    s.zIndex = '-1'
    s.boxSizing = 'border-box'
    s.padding = '2px 6px'
    s.fontSize = '10px'
    s.lineHeight = '1.3'
    s.whiteSpace = 'pre-wrap'
    s.wordBreak = 'break-word'
    document.body.appendChild(captionMeasureEl)
  }
  captionMeasureEl.style.width = `${Math.max(1, Math.floor(widthPx))}px`
  captionMeasureEl.textContent = text
  return Math.ceil(captionMeasureEl.getBoundingClientRect().height)
}

function disposeCaptionMeasureEl() {
  if (captionMeasureEl?.parentNode) {
    captionMeasureEl.parentNode.removeChild(captionMeasureEl)
  }
  captionMeasureEl = null
}

/**
 * Festes Box-Modell der Vollansicht (einzige Quelle für Rahmen UND Morph):
 *
 *   ┌─ gelber Rahmen ─────────────┐
 *   │   10px Abstand              │
 *   │   [ Bild  imageW × imageH ] │
 *   │   10px Abstand              │
 *   │   Infotext (linksbündig)    │  ← nur falls vorhanden
 *   │   10px Abstand              │
 *   └─────────────────────────────┘
 *
 * Bildgröße = contain in den verbleibenden Platz; Rahmengröße = Bild + fixe
 * Abstände + (optional) gemessene Texthöhe. Dadurch skaliert der Rahmen exakt
 * mit dem Bild und nichts wird abgeschnitten.
 */
function computeLightboxLayout(index) {
  if (index == null || index < 0 || index >= layout.value.length) return null
  const item = layout.value[index]
  const src = item?.src
  const { w: nw, h: nh } = dimensionsForLightbox(index, src)

  const capRaw = lightboxCaptionRawForItem(item)
  // Im Mobil-Landscape wird der Text nur eingeplant, wenn Info aktiv ist.
  const hasCaption = isCaptionInFrame(index)

  const PAD = LB_FRAME_PAD
  const GAP = LB_CAPTION_GAP
  const insets = lbInsets()
  // Breite: Viewport − seitliche Reserven (Landscape: Platz für die Icons,
  // sonst der symmetrische LB_VIEWPORT_W_FRAC-Rand).
  const slotMaxW = Math.max(1, window.innerWidth - insets.left - insets.right)
  // Rahmen passt garantiert in (Viewport − Reserven) → kein Abschneiden (Landscape-Fix).
  const slotMaxH = Math.max(1, window.innerHeight - insets.top - insets.bottom)
  const innerMaxW = Math.max(1, slotMaxW - 2 * PAD)

  // Iterativ: Textbreite hängt von der Bildbreite ab, Bildhöhe von der Texthöhe.
  // Zwei, drei Durchläufe konvergieren stabil.
  let capH = 0
  let iw = 0
  let ih = 0
  let captionWidth = innerMaxW
  for (let pass = 0; pass < 3; pass++) {
    capH = hasCaption ? measureCaptionHeight(capRaw, captionWidth) : 0
    const reserve = hasCaption ? GAP + capH : 0
    const innerMaxH = Math.max(1, slotMaxH - 2 * PAD - reserve)
    // Rahmen füllt den verfügbaren Platz nach Seitenverhältnis – bewusst OHNE
    // Begrenzung auf die native Pixelgröße. So liefert das Proxy (1024px) exakt
    // dieselben Rahmenmaße wie das spätere High-Res (2048px) → kein Sprung beim
    // Crossfade. Das Bild selbst skaliert per object-fit hoch (siehe CSS).
    const fit = fitContain(nw, nh, innerMaxW, innerMaxH)
    iw = fit.w
    ih = fit.h
    captionWidth = iw
  }

  const imageW = Math.max(1, Math.round(iw))
  const imageH = Math.max(1, Math.round(ih))
  const captionH = hasCaption ? capH : 0
  const frameW = imageW + 2 * PAD
  const frameH = imageH + 2 * PAD + (hasCaption ? GAP + captionH : 0)

  return { imageW, imageH, captionH, frameW, frameH, hasCaption }
}

function recomputeLbLayout() {
  if (lightboxIndex.value == null || viewerMode.value === 'idle') {
    lbLayout.value = null
    return
  }
  lbLayout.value = computeLightboxLayout(lightboxIndex.value)
}

const lbFrameStyle = computed(() => {
  const L = lbLayout.value
  if (!L) return {}
  // Rahmen bekommt feste Breite UND Höhe → definiter Kontext für das Bild,
  // damit dessen max-height: 100% sauber auflöst (kein Kollabieren in Flexbox).
  // max-* deckeln nur gegen den Viewport; ein kleines Bild wird nie gestaucht.
  return {
    width: `${L.frameW}px`,
    height: `${L.frameH}px`,
    maxWidth: isMobileLayout.value ? '100%' : 'min(95vw, 100%)',
    maxHeight: '100%',
    boxSizing: 'border-box',
  }
})

function scheduleMorphFinish(modeAfter, morphKind) {
  clearMorphTimer()
  const ms = morphTimingMs(morphKind)
  morphFinishTimer = window.setTimeout(() => {
    morphFinishTimer = null
    if (modeAfter === 'viewing') {
      viewerMode.value = 'viewing'
    } else if (modeAfter === 'idle') {
      lightboxIndex.value = null
      viewerMode.value = 'idle'
    }
  }, ms + 40)
}

function openLightbox(index, event) {
  if (viewerMode.value !== 'idle') return
  clearMorphTimer()
  clearMorphCloseFadeTimer()
  clearCaptionFadeBeforeCloseTimer()
  lbCaptionFastHide.value = false
  clearLbAspectLock()
  infoVisible.value = true
  isHighResLoaded.value = false
  morphShellOpacity.value = 1
  lbBackdropOpacity.value = 1
  if (isMobileLayout.value) resetViewportZoom()
  const src = layout.value[index]?.src ?? ''
  prefetchNatural(src)

  const imgEl = event?.currentTarget?.querySelector('.viewer-tile-img')
  const capRaw =
    layout.value[index]?.caption != null
      ? String(layout.value[index].caption)
      : ''
  const cap = capRaw.trim()
  let nw = imgEl?.naturalWidth
  let nh = imgEl?.naturalHeight
  if ((!nw || !nh) && src && naturalBySrc[src]) {
    nw = naturalBySrc[src].w
    nh = naturalBySrc[src].h
  }
  if (!nw || !nh) {
    nw = 1600
    nh = 900
  }
  // Thumbnail ist das Proxy → nur das Seitenverhältnis übernehmen, falls die
  // echten High-Res-Maße noch nicht vorliegen (sonst nicht "downgraden").
  if (src && imgEl?.naturalWidth > 0 && imgEl.naturalHeight > 0 && !naturalBySrc[src]) {
    naturalBySrc[src] = { w: imgEl.naturalWidth, h: imgEl.naturalHeight }
  }
  setLbAspectLock(index, nw, nh)

  if (!imgEl) {
    lightboxIndex.value = index
    viewerMode.value = 'viewing'
    return
  }
  const thumb = imgEl.getBoundingClientRect()
  if (!thumb.width && !thumb.height) {
    lightboxIndex.value = index
    viewerMode.value = 'viewing'
    return
  }

  const L = computeLightboxLayout(index)
  if (!L) {
    lightboxIndex.value = index
    viewerMode.value = 'viewing'
    return
  }
  lbLayout.value = L
  const { frameW, frameH, hasCaption, captionH } = L
  const openInsets = lbInsets()
  const finalLeft = (window.innerWidth - frameW) / 2
  const finalTop =
    openInsets.top +
    (window.innerHeight - openInsets.top - openInsets.bottom - frameH) / 2
  const morphStartH = thumb.height

  // Zoom nutzt das gecachte Proxy → verzögerungsfrei und scharf.
  morphSrc.value = toProxySrc(src)
  isHighResLoaded.value = false
  lightboxIndex.value = index
  viewerMode.value = 'opening'

  setMorphShell(
    { top: thumb.top, left: thumb.left, width: thumb.width, height: morphStartH },
    {
      withTransition: false,
      morphKind: 'open',
      outlinePx: LB_FULL_OUTLINE_PX,
      showCaption: false,
      captionReserve: false,
      captionH,
      captionText: capRaw,
      objectFit: 'cover',
    },
  )

  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMorphShell(
          { top: finalTop, left: finalLeft, width: frameW, height: frameH },
          {
            withTransition: true,
            morphKind: 'open',
            outlinePx: LB_FULL_OUTLINE_PX,
            showCaption: !!cap,
            captionReserve: hasCaption,
            captionH,
            captionText: capRaw,
            objectFit: 'contain',
          },
        )
        scheduleMorphFinish('viewing', 'open')
      })
    })
  })
}

function runCloseLightboxMorph() {
  // Mobil wurde während des Blätterns bewusst nicht gescrollt (URL-Leiste). Jetzt,
  // beim Schließen, die aktive Kachel synchron in den Viewport holen, damit der
  // Zoom-Zurück sie an korrekter Position trifft (hinter dem Backdrop verdeckt).
  if (isMobileLayout.value) syncActiveThumbnailInstant(lightboxIndex.value)

  const item = layout.value[lightboxIndex.value]
  const id = item?.i
  const thumbImg = id
    ? document.querySelector(
        `[data-viewer-tile-id="${escapeAttrSelectorValue(id)}"] .viewer-tile-img`,
      )
    : null
  const thumbRectRaw = thumbImg?.getBoundingClientRect()
  const bigEl = lbContentWrapRef.value
  const bigRectRaw = bigEl?.getBoundingClientRect()
  let thumbRect = roundRectPx(thumbRectRaw)
  let bigRect = roundRectPx(bigRectRaw)

  const L = lbLayout.value || computeLightboxLayout(lightboxIndex.value)
  const closeCaptionH = L?.captionH ?? 0
  const closeHasCaption = !!L?.hasCaption

  if (!bigRect && L) {
    const closeInsets = lbInsets()
    bigRect = {
      top: Math.round(
        closeInsets.top +
          (window.innerHeight - closeInsets.top - closeInsets.bottom - L.frameH) /
            2,
      ),
      left: Math.round((window.innerWidth - L.frameW) / 2),
      width: L.frameW,
      height: L.frameH,
    }
  }

  if (!thumbRect || !bigRect) {
    lbCaptionFastHide.value = false
    lightboxIndex.value = null
    viewerMode.value = 'idle'
    clearMorphShell()
    return
  }

  clearMorphTimer()
  clearMorphCloseFadeTimer()
  morphShellOpacity.value = 1
  lbBackdropOpacity.value = 1
  viewerMode.value = 'closing'
  morphSrc.value = currentLightboxProxySrc.value

  setMorphShell(
    {
      top: bigRect.top,
      left: bigRect.left,
      width: bigRect.width,
      height: bigRect.height,
    },
    {
      withTransition: false,
      morphKind: 'close',
      outlinePx: LB_FULL_OUTLINE_PX,
      showCaption: false,
      captionReserve: closeHasCaption,
      captionH: closeCaptionH,
      captionText: '',
      objectFit: 'contain',
    },
  )

  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMorphShell(
          {
            top: thumbRect.top,
            left: thumbRect.left,
            width: thumbRect.width,
            height: thumbRect.height,
          },
          {
            withTransition: true,
            morphKind: 'close',
            outlinePx: 4,
            showCaption: false,
            captionReserve: false,
            captionH: 0,
            captionText: '',
            objectFit: 'cover',
            appendCloseOpacityFade: true,
          },
        )
        const fadeDelay = Math.max(0, MORPH_MS_CLOSE - MORPH_CLOSE_FADE_MS)
        morphCloseFadeTimer = window.setTimeout(() => {
          morphCloseFadeTimer = null
          morphShellOpacity.value = 0
          lbBackdropOpacity.value = 0
        }, fadeDelay)
        scheduleMorphFinish('idle', 'close')
      })
    })
  })
}

function closeLightbox() {
  if (lightboxIndex.value === null) return
  startLenisScroll()
  if (viewerMode.value === 'opening') {
    clearMorphTimer()
    clearMorphCloseFadeTimer()
    clearCaptionFadeBeforeCloseTimer()
    lbCaptionFastHide.value = false
    lightboxIndex.value = null
    viewerMode.value = 'idle'
    clearMorphShell()
    return
  }
  if (viewerMode.value !== 'viewing') return
  if (captionFadeBeforeCloseTimer != null) return

  if (captionInFrame.value) {
    lbCaptionFastHide.value = true
    captionFadeBeforeCloseTimer = window.setTimeout(() => {
      captionFadeBeforeCloseTimer = null
      runCloseLightboxMorph()
    }, 100)
    return
  }
  runCloseLightboxMorph()
}

function prevImage() {
  if (viewerMode.value !== 'viewing') return
  const n = layout.value.length
  if (n === 0 || lightboxIndex.value === null) return
  lightboxIndex.value = (lightboxIndex.value - 1 + n) % n
}

function nextImage() {
  if (viewerMode.value !== 'viewing') return
  const n = layout.value.length
  if (n === 0 || lightboxIndex.value === null) return
  lightboxIndex.value = (lightboxIndex.value + 1) % n
}

const gridMargin = computed(() => (isMobileLayout.value ? [5, 5] : [10, 10]))

function onLightboxKeydown(e) {
  if (lightboxIndex.value === null) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closeLightbox()
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prevImage()
    return
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    nextImage()
  }
}

const lightboxOpen = computed(
  () => lightboxIndex.value !== null && viewerMode.value !== 'idle',
)

/** Mobil-Nav sofort sichtbar (auch während Morph), unabhängig vom High-Res-@load. */
const showLbMobileNav = computed(
  () => lightboxOpen.value && viewerMode.value !== 'closing',
)

watch(lightboxOpen, async (open) => {
  if (open) {
    stopLenisScroll()
    if (isMobileLayout.value) {
      resetViewportZoom()
      await nextTick()
      if (lbOverlayRef.value) {
        bindOverlayToVisualViewport(lbOverlayRef.value)
      }
    }
    return
  }
  unbindOverlayFromVisualViewport()
  restoreViewportZoom()
  clearLbAspectLock()
  startLenisScroll()
})

const galleryScrollbarActive = computed(
  () =>
    loadState.value === 'idle' &&
    layout.value.length > 0 &&
    !lightboxOpen.value,
)

const {
  shellCursorClass: gridShellCursorClass,
  onShellPointerDown: onGridShellPointerDownGas,
  onShellPointerMove: onGridShellPointerMoveCursor,
  onShellPointerLeave: onGridShellPointerLeaveCursor,
} = useGasPedalScroll({
  shellRef: gridShellRef,
  isEnabled: () =>
    layout.value.length > 0 &&
    loadState.value === 'idle' &&
    !lightboxOpen.value,
  cursorClearSelector: '.viewer-tile-btn',
})

const lightboxBackdropStyle = computed(() => {
  const style = {
    transitionProperty: 'opacity',
    transitionTimingFunction: 'ease-out',
  }
  if (viewerMode.value === 'closing') {
    style.opacity = lbBackdropOpacity.value
    style.transitionDuration = `${MORPH_CLOSE_FADE_MS}ms`
  }
  return style
})

async function loadGalleryFromConfig() {
  lightboxIndex.value = null
  viewerMode.value = 'idle'
  clearMorphShell()
  clearMorphTimer()
  clearMorphCloseFadeTimer()
  clearCaptionFadeBeforeCloseTimer()
  lbCaptionFastHide.value = false

  revealTiles.value = false
  loadState.value = 'loading'
  const items = await fetchGalleryLayoutItems(props.configPath)
  layout.value = items.map((it) => {
    const src = resolveGalleryImageSrc(it.src, props.configPath)
    // Thumbnails laden ausschließlich das kleine Proxy → schneller Erststart.
    return { ...it, src, proxySrc: toProxySrc(src) }
  })
  loadState.value = 'idle'

  await nextTick()
  if (layout.value.length > 0) {
    requestAnimationFrame(() => {
      revealTiles.value = true
    })
    await nextTick()
    bindGridHostResizeObserver()
  } else {
    await nextTick()
    bindGridHostResizeObserver()
  }

  await nextTick()
  notifyLenisAfterGridSettled()
}

onMounted(async () => {
  preloadLbNavIcons()
  await loadGalleryFromConfig()

  window.addEventListener('keydown', onLightboxKeydown)
})

watch(
  () => props.configPath,
  async () => {
    await loadGalleryFromConfig()
  },
)

watch(gridHostRef, (el) => {
  if (el) nextTick(() => bindGridHostResizeObserver())
})

watch(gridRowHeight, () => {
  notifyLenisAfterGridSettled()
})

watch(viewerMode, (m) => {
  if (m === 'idle') {
    lbCaptionFastHide.value = false
  }
})

/*
 * Bildwechsel (Next/Prev): High-Res-Einblendung sofort zurücksetzen. Da die
 * Fade-Ebene per :key neu erzeugt wird, bricht der Browser den alten High-Res-
 * Download ab; der neue startet erst mit dem frischen <img> der neuen Ansicht.
 */
watch(lightboxIndex, (idx) => {
  isHighResLoaded.value = false
  if (idx == null) return
  const src = layout.value[idx]?.src
  if (!src) return
  const dim = naturalBySrc[src]
  if (dim?.w > 0 && dim?.h > 0) {
    setLbAspectLock(idx, dim.w, dim.h)
  } else {
    clearLbAspectLock()
    prefetchNatural(src)
  }
})

watch(
  () => [lightboxIndex.value, viewerMode.value, layout.value.length],
  () => {
    if (viewerMode.value !== 'viewing' || lightboxIndex.value == null) return
    const n = layout.value.length
    if (n === 0) return
    const idx = lightboxIndex.value
    for (const j of [idx - 1, idx, idx + 1]) {
      const ii = ((j % n) + n) % n
      prefetchNatural(layout.value[ii]?.src)
    }
  },
  { flush: 'post' },
)

watch(
  () => [lightboxIndex.value, viewerMode.value],
  () => {
    if (viewerMode.value !== 'viewing' || lightboxIndex.value == null) return
    // Mobil: beim Bildwechsel das Fenster NICHT scrollen – jeder Fenster-Scroll
    // blendet sonst die URL-Leiste wieder ein. Die Kachel-Synchronisation fürs
    // Zoom-Zurück passiert einmalig beim Schließen (syncActiveThumbnailInstant).
    if (isMobileLayout.value) return
    nextTick(() => {
      requestAnimationFrame(() => {
        scrollActiveThumbnailIntoView(lightboxIndex.value)
      })
    })
  },
  { flush: 'post' },
)

/**
 * Box-Layout (Rahmen/Bild/Text) neu berechnen, sobald sich Index, Modus oder die
 * gemessenen Bildmaße ändern. Einzige Quelle für Rahmen UND Morph → bleibt synchron.
 */
watch(
  () => {
    const src = currentLightboxSrc.value
    const dim = src ? naturalBySrc[src] : null
    return [lightboxIndex.value, viewerMode.value, src, dim?.w, dim?.h]
  },
  () => {
    if (viewerMode.value === 'idle' || lightboxIndex.value == null) {
      lbLayout.value = null
      return
    }
    recomputeLbLayout()
  },
  { flush: 'post' },
)

function onWindowResizeLightbox() {
  if (lightboxIndex.value != null && viewerMode.value !== 'idle') {
    recomputeLbLayout()
  }
}

// Mode/Orientierung/Info ändern die Reserven bzw. die Textzeile → neu rechnen.
watch([isMobileLayout, isLandscape, infoVisible], () => {
  if (lightboxIndex.value != null && viewerMode.value !== 'idle') {
    recomputeLbLayout()
  }
})

onMounted(() => {
  window.addEventListener('resize', onWindowResizeLightbox)
  syncOrientation()
  orientationMq = window.matchMedia('(orientation: landscape)')
  orientationMq.addEventListener('change', syncOrientation)
})

onBeforeUnmount(() => {
  clearMorphTimer()
  clearMorphCloseFadeTimer()
  clearCaptionFadeBeforeCloseTimer()
  window.removeEventListener('keydown', onLightboxKeydown)
  window.removeEventListener('resize', onWindowResizeLightbox)
  orientationMq?.removeEventListener('change', syncOrientation)
  disposeCaptionMeasureEl()
  gridHostWidthObserver.disconnect()
  gridLayoutHeightObserver?.disconnect()
  gridLayoutHeightObserver = null
  cancelScheduledResizeLenis()
  unbindOverlayFromVisualViewport()
  restoreViewportZoom()
  if (lightboxOpen.value) startLenisScroll()
})
</script>

<template>
  <GalleryScrollbar
    :active="galleryScrollbarActive"
    :hide-on-mobile="isMobileLayout"
  />
  <div
    ref="viewerRootRef"
    class="viewer-root relative min-h-svh w-full overflow-x-hidden bg-transparent"
  >
    <p
      v-if="loadState === 'loading'"
      class="flex min-h-svh items-center justify-center text-sm text-zinc-500"
    >
      Lade Galerie…
    </p>

    <p
      v-else-if="layout.length === 0"
      class="flex min-h-svh items-center justify-center text-sm text-zinc-500"
    >
      Keine Bilder gefunden
    </p>

    <div v-else class="relative min-h-svh">
      <div
        class="viewer-bg-grid pointer-events-none"
        aria-hidden="true"
      />
      <div
        class="viewer-bg-depth pointer-events-none"
        aria-hidden="true"
      />
      <div
        ref="gridShellRef"
        class="viewer-grid-shell relative z-10"
        :class="gridShellCursorClass"
        @pointerdown="onGridShellPointerDownGas"
        @pointermove="onGridShellPointerMoveCursor"
        @pointerleave="onGridShellPointerLeaveCursor"
      >
      <div
        ref="gridHostRef"
        class="viewer-grid-host w-full px-[10%] max-[767px]:px-[clamp(8px,1.6vw,14px)]"
      >
      <GridLayout
        v-model:layout="layout"
        :col-num="48"
        :row-height="gridRowHeight"
        :margin="gridMargin"
        :is-draggable="false"
        :is-resizable="false"
        :vertical-compact="false"
        :use-css-transforms="true"
        :use-style-cursor="false"
        class="viewer-grid w-full"
        @layout-ready="onGridLayoutReady"
      >
        <GridItem
          v-for="(item, index) in layout"
          :key="item.i"
          :x="item.x"
          :y="item.y"
          :w="item.w"
          :h="item.h"
          :i="item.i"
        >
          <div
            class="viewer-tile-wrap absolute inset-0 z-0 overflow-visible transition-[z-index] duration-0 hover:z-[9999]"
          >
            <button
              type="button"
              class="viewer-tile-btn cursor-thumb group relative z-10 block h-full w-full border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/80"
              :data-viewer-tile-id="item.i"
              :aria-label="`Vergrößern: ${item.i}`"
              @click="openLightbox(index, $event)"
            >
              <div
                class="viewer-tile-media relative h-full w-full overflow-hidden bg-neutral-900"
                :style="tileMediaStyle(item)"
              >
                <img
                  :src="item.proxySrc"
                  :alt="item.i"
                  draggable="false"
                  class="viewer-tile-img pointer-events-none absolute inset-0 h-full w-full object-cover"
                  :class="revealTiles ? 'opacity-100' : 'opacity-0'"
                  :style="{
                    '--reveal-delay': revealTiles ? `${index * 48}ms` : '0ms',
                  }"
                  loading="lazy"
                />
              </div>
              <div
                class="viewer-tile-ring pointer-events-none absolute inset-0 opacity-0 outline outline-[4px] outline-yellow-400 transition-opacity duration-[2000ms] ease-out will-change-[opacity,outline-color] group-hover:opacity-100 group-hover:!duration-0"
                aria-hidden="true"
              />
            </button>
          </div>
        </GridItem>
      </GridLayout>
      </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="lb-overlay">
        <div
          v-if="lightboxOpen"
          ref="lbOverlayRef"
          class="lb-overlay fixed inset-0 z-[200] flex items-center justify-center"
          :class="{
            'pointer-events-none': viewerMode === 'closing',
            'lb-overlay--scroll-lock': lightboxOpen && viewerMode !== 'closing',
            'lb-overlay--mobile': isMobileLayout,
            'lb-overlay--portrait': isMobilePortrait,
            'lb-overlay--landscape': isMobileLandscape,
            'lb-overlay--opening': viewerMode === 'opening',
            'lb-overlay--closing': viewerMode === 'closing',
          }"
          role="dialog"
          aria-modal="true"
          aria-label="Bildansicht"
          @click.self="closeLightbox"
        >
          <Transition name="lb-dim" appear>
            <div
              v-if="lightboxOpen"
              class="lb-backdrop absolute inset-0 z-0 will-change-[opacity]"
              :style="lightboxBackdropStyle"
              aria-hidden="true"
              @click="closeLightbox"
            />
          </Transition>

          <div
            v-if="viewerMode === 'opening' || viewerMode === 'closing'"
            ref="morphShellRef"
            class="lb-morph-shell pointer-events-none will-change-[top,left,width,height,opacity]"
            :style="[morphShellStyle, { opacity: morphShellOpacity }]"
          >
            <!-- Cover-Phase (Start/Ende = Thumbnail): Bild füllt die Kachel randlos -->
            <img
              v-if="morphInnerObjectFit === 'cover'"
              ref="morphImgRef"
              :src="morphSrc"
              alt=""
              class="absolute inset-0 h-full w-full bg-neutral-950/30 object-cover"
              :style="{ transition: morphInnerTransition }"
            />

            <!-- Contain-Phase (= Vollansicht): fester 10px-Rahmen, Text darunter -->
            <div v-else class="lb-frame-box">
              <div class="lb-img-area">
                <img
                  ref="morphImgRef"
                  :src="morphSrc"
                  alt=""
                  class="lb-main-img"
                  :style="{ transition: morphInnerTransition }"
                />
              </div>
              <div
                v-if="morphCaptionReserve"
                class="lb-caption"
                :style="{ height: `${morphCaptionH}px`, opacity: morphShowCaption ? 1 : 0 }"
              >
                <div class="lb-caption-inner">{{ morphCaptionText }}</div>
              </div>
            </div>
          </div>

          <div
            v-if="viewerMode === 'viewing' && lightboxIndex !== null"
            class="lb-viewing-shell relative z-[15] flex min-h-[min(90vh,100%)] min-w-[min(95vw,100%)] max-h-[92vh] max-w-[min(95vw,100%)] items-center justify-center"
          >
            <div class="lb-fade-stage">
              <Transition name="lb-fade">
                <div :key="lightboxIndex" class="lb-fade-layer">
                  <div
                    ref="lbContentWrapRef"
                    class="lb-framed lb-frame-box mx-auto overflow-hidden bg-neutral-950/30 outline outline-[1px] outline-yellow-400"
                    :style="lbFrameStyle"
                  >
                    <div class="lb-img-area">
                      <!-- Ebene 1 (unten): gecachtes Proxy → sofort scharf, trägt den Zoom. -->
                      <img
                        :src="currentLightboxProxySrc"
                        :alt="layout[lightboxIndex]?.i"
                        class="lb-main-img lb-img-proxy shadow-2xl"
                        draggable="false"
                        @load="onLightboxImgLoad"
                      />
                      <!-- Ebene 2 (oben): High-Res, lädt erst beim Öffnen, blendet nach @load weich ein. -->
                      <img
                        :src="currentLightboxSrc"
                        :alt="layout[lightboxIndex]?.i"
                        class="lb-main-img lb-img-hires"
                        :class="{ 'is-loaded': isHighResLoaded }"
                        draggable="false"
                        @load="onHighResLoad"
                      />
                    </div>
                    <div
                      v-if="captionInFrame"
                      class="lb-caption"
                      :class="{ 'lb-caption--fast-hide': lbCaptionFastHide }"
                    >
                      <div class="lb-caption-inner">
                        {{ currentLightboxCaptionRaw }}
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- Desktop: 3-Zonen-Mausnavigation (prev / close / next) -->
            <div
              v-if="!isMobileLayout"
              class="lb-zone-controls absolute inset-0 z-[40] flex w-full"
              aria-hidden="true"
            >
              <button
                type="button"
                class="lb-zone-prev cursor-left h-full w-1/3 border-0 bg-transparent p-0"
                aria-label="Vorheriges Bild"
                @click.stop="prevImage"
              />
              <button
                type="button"
                class="lb-zone-close cursor-close h-full w-1/3 border-0 bg-transparent p-0"
                aria-label="Schließen"
                @click.stop="closeLightbox"
              />
              <button
                type="button"
                class="lb-zone-next cursor-right h-full w-1/3 border-0 bg-transparent p-0"
                aria-label="Nächstes Bild"
                @click.stop="nextImage"
              />
            </div>
          </div>

          <!-- Mobil-Portrait: Icon-Reihe unterhalb des Rahmens (prev / close / next) -->
          <div
            v-if="isMobilePortrait && showLbMobileNav"
            class="lb-mnav lb-mnav--portrait"
          >
            <button
              type="button"
              class="lb-mnav-btn"
              aria-label="Vorheriges Bild"
              @click.stop="prevImage"
            >
              <img
                class="lb-mnav-arrow-img"
                :src="iconUrl('left.png')"
                alt=""
                draggable="false"
                decoding="sync"
                fetchpriority="high"
              />
            </button>
            <button
              type="button"
              class="lb-mnav-btn"
              aria-label="Schließen"
              @click.stop="closeLightbox"
            >
              <img
                :src="iconUrl('close.png')"
                alt=""
                draggable="false"
                decoding="sync"
                fetchpriority="high"
              />
            </button>
            <button
              type="button"
              class="lb-mnav-btn"
              aria-label="Nächstes Bild"
              @click.stop="nextImage"
            >
              <img
                class="lb-mnav-arrow-img"
                :src="iconUrl('right.png')"
                alt=""
                draggable="false"
                decoding="sync"
                fetchpriority="high"
              />
            </button>
          </div>

          <!-- Mobil-Landscape: Ecken-Icons (info TL, close TR, prev BL, next BR) -->
          <template v-if="isMobileLandscape && showLbMobileNav">
            <button
              type="button"
              class="lb-mnav-btn lb-mnav--ls-info"
              :aria-label="infoVisible ? 'Infotext ausblenden' : 'Infotext einblenden'"
              :aria-pressed="infoVisible"
              @click.stop="toggleInfo"
            >
              <img
                :key="infoIconName"
                :src="infoIconSrc"
                alt=""
                draggable="false"
                decoding="sync"
                fetchpriority="high"
              />
            </button>
            <button
              type="button"
              class="lb-mnav-btn lb-mnav--ls-close"
              aria-label="Schließen"
              @click.stop="closeLightbox"
            >
              <img
                :src="iconUrl('close.png')"
                alt=""
                draggable="false"
                decoding="sync"
                fetchpriority="high"
              />
            </button>
            <button
              type="button"
              class="lb-mnav-btn lb-mnav--ls-prev"
              aria-label="Vorheriges Bild"
              @click.stop="prevImage"
            >
              <img
                class="lb-mnav-arrow-img"
                :src="iconUrl('left.png')"
                alt=""
                draggable="false"
                decoding="sync"
                fetchpriority="high"
              />
            </button>
            <button
              type="button"
              class="lb-mnav-btn lb-mnav--ls-next"
              aria-label="Nächstes Bild"
              @click.stop="nextImage"
            >
              <img
                class="lb-mnav-arrow-img"
                :src="iconUrl('right.png')"
                alt=""
                draggable="false"
                decoding="sync"
                fetchpriority="high"
              />
            </button>
          </template>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/*
 * Unendlich wirkendes Raster: riesige Fläche + repeat.
 * Dezente Linien (niedrige Alpha), 10er-Linien nur etwas kräftiger.
 */
.viewer-bg-grid {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 0;
  width: 500vmin;
  height: 500vmin;
  margin-left: -250vmin;
  margin-top: -250vmin;
  background-color: #09090b;
  background-image:
    linear-gradient(
      90deg,
      transparent 19px,
      rgba(255, 255, 255, 0.048) 19px,
      rgba(255, 255, 255, 0.048) 20px
    ),
    linear-gradient(
      0deg,
      transparent 19px,
      rgba(255, 255, 255, 0.048) 19px,
      rgba(255, 255, 255, 0.048) 20px
    ),
    linear-gradient(
      90deg,
      transparent 199px,
      rgba(255, 255, 255, 0.095) 199px,
      rgba(255, 255, 255, 0.095) 200px
    ),
    linear-gradient(
      0deg,
      transparent 199px,
      rgba(255, 255, 255, 0.095) 199px,
      rgba(255, 255, 255, 0.095) 200px
    );
  background-size: 20px 20px, 20px 20px, 200px 200px, 200px 200px;
  background-repeat: repeat, repeat, repeat, repeat;
}

/*
 * Waagerechter Schacht: links & rechts hell (Gitter sichtbar), Mitte dunkel (Bildspalte).
 * Engeres volles Zentrum, weiche lange Verläufe zu den Seiten (mehr Stufen).
 * linear-gradient(to right …): 0 % = links, 100 % = rechts.
 * z-index 1: über Grid (0), unter Thumbnails (.viewer-grid-shell z-10).
 */
.viewer-bg-depth {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  writing-mode: horizontal-tb;
  direction: ltr;
  background: linear-gradient(
    to right,
    transparent 0%,
    transparent 5%,
    rgba(0, 0, 0, 0.08) 14%,
    rgba(0, 0, 0, 0.35) 26%,
    rgba(0, 0, 0, 0.68) 36%,
    rgba(0, 0, 0, 0.85) 40%,
    rgba(0, 0, 0, 0.85) 60%,
    rgba(0, 0, 0, 0.68) 64%,
    rgba(0, 0, 0, 0.35) 74%,
    rgba(0, 0, 0, 0.08) 86%,
    transparent 95%,
    transparent 100%
  );
}

.viewer-grid :deep(.vue-grid-layout) {
  min-height: 100svh;
}

.viewer-grid :deep(.vue-grid-item) {
  overflow: visible;
}

/* Festes Seitenverhältnis aus Raster-Konfiguration — kein Layout-Sprung beim Bild-Load */
.viewer-tile-media {
  contain: layout style;
  min-height: 0;
  max-height: 100%;
}

.viewer-grid :deep(.vue-resizable-handle) {
  display: none !important;
}

.viewer-tile-img {
  will-change: transform, outline-color;
  /* Opacity-Reveal mit Delay; Transform ohne Delay → flüssiger Zoom */
  transition:
    opacity 400ms ease-out var(--reveal-delay, 0s),
    transform 0.8s v-bind('TILE_SPRING');
}

.viewer-tile-btn:hover .viewer-tile-img {
  transition:
    opacity 400ms ease-out 0s,
    transform 0.25s v-bind('TILE_SPRING');
  transform: scale(1.15);
}

.viewer-tile-btn:not(:hover) .viewer-tile-img {
  transform: scale(1);
}

.lb-overlay-enter-active {
  transition: opacity 0.2s cubic-bezier(0.36, 1.06, 0.52, 1);
  will-change: opacity;
}

.lb-overlay-leave-active {
  transition: opacity 0ms;
}

.lb-overlay-enter-from,
.lb-overlay-leave-to {
  opacity: 0;
}

.lb-overlay {
  padding: 16px;
  background-color: transparent;
}

.lb-backdrop {
  background-color: rgb(0 0 0 / 0.9);
}

.lb-dim-enter-active,
.lb-dim-leave-active {
  transition: opacity 0.3s ease;
}

.lb-dim-enter-from,
.lb-dim-leave-to {
  opacity: 0;
}

.lb-overlay.lb-overlay--scroll-lock {
  touch-action: none;
}

/*
 * Crossfade-Bühne: feste Höhe (= berechnete Maximalhöhe), beide Bild-Layer
 * absolut übereinander. Bildwechsel = reines Opacity-Crossfade (kein Sliden).
 * Auf Mobil-Portrait unten Platz für die später folgende Steuerung.
 */
.lb-fade-stage {
  position: relative;
  width: 100%;
  max-width: min(95vw, 100%);
  height: 88svh;
  max-height: 88svh;
  box-sizing: border-box;
}

.lb-fade-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lb-fade-enter-active,
.lb-fade-leave-active {
  transition: opacity 240ms ease;
  will-change: opacity;
}

.lb-fade-enter-from,
.lb-fade-leave-to {
  opacity: 0;
}

/*
 * Festes Box-Modell (Vollansicht UND Morph-Endzustand):
 *   [10px] Bild [10px] Text [10px]  → Rahmen skaliert exakt mit der Bildgröße.
 * Maße kommen aus computeLightboxLayout(): Rahmenbreite + Bildgröße werden als
 * Inline-Styles gesetzt, damit nichts verzerrt oder abgeschnitten wird.
 */
.lb-frame-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  box-sizing: border-box;
  max-width: 100%;
}

.lb-morph-shell .lb-frame-box {
  width: 100%;
  height: 100%;
  background: rgb(10 10 10 / 0.3);
}

.lb-img-area {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.lb-main-img {
  display: block;
  /*
   * Bild füllt den (vom Box-Modell exakt aufs Seitenverhältnis dimensionierten)
   * Bildbereich vollständig aus – Upscaling über die native Größe hinaus erlaubt.
   * Gilt auch für die Morph-Contain-Phase, damit Zoom-Ende und Vollansicht
   * pixelgenau übereinstimmen.
   */
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/*
 * Zwei-Ebenen-Struktur der Vollansicht: Proxy und High-Res liegen exakt
 * deckungsgleich übereinander und füllen den (vom Box-Modell definierten)
 * Bildbereich. object-fit: contain erbt von .lb-main-img → da der Bereich
 * bereits das Bildseitenverhältnis hat, sitzt das Bild pixelgenau wie zuvor.
 */
.lb-img-proxy,
.lb-img-hires {
  position: absolute;
  inset: 0;
  /*
   * Beide Ebenen nehmen mathematisch exakt dieselbe Box ein (= Bildbereich des
   * Rahmens). width/height: 100% + object-fit: contain → identische Einpassung
   * und Proportionen. max-*: none hebt die .lb-main-img-Begrenzung auf die native
   * Dateigröße auf, sodass auch das 1024px-Proxy den Rahmen voll ausfüllt
   * (Upscaling erlaubt) und der Crossfade zu 100 % deckungsgleich bleibt.
   */
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  object-fit: contain;
}

/* High-Res standardmäßig unsichtbar, blendet nach dem Laden weich ein. */
.lb-img-hires {
  opacity: 0;
  transition: opacity 0.4s ease;
}

.lb-img-hires.is-loaded {
  opacity: 1;
}

/* Infotext: linksbündig, unter dem Bild, innerhalb des gelben Rahmens. */
.lb-caption {
  flex: 0 0 auto;
  align-self: stretch;
  min-width: 0;
  overflow: hidden;
}

.lb-caption-inner {
  box-sizing: border-box;
  padding: 2px 6px;
  text-align: left;
  font-size: 10px;
  line-height: 1.3;
  color: #fafafa;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.lb-caption--fast-hide {
  opacity: 0;
  transition: opacity 95ms ease-out;
}

/* Sanftes Auf-/Zuklappen des Textbereichs beim Info-Toggle (Landscape). */
.lb-caption {
  transition: opacity 160ms ease;
}

/* ===================================================================== *
 *  Mobil (Touch / schmaler Viewport) — getrennt nach Orientierung.
 *  Klassen kommen aus Vue-Reaktivität, damit CSS & Geometrie (JS) exakt
 *  dieselbe Bedingung nutzen. Werte = Reserven aus dem Script.
 *  100dvh statt vh/svh → URL-Leiste/Systembalken klauen keinen Platz und
 *  das Bild inkl. Rahmen wird nie abgeschnitten (Landscape-Fix).
 * ===================================================================== */
.lb-overlay--mobile {
  /* Transparent: Thumbnails bleiben sichtbar, nur .lb-backdrop dimmt (90 %). */
  background-color: transparent;
  height: 100dvh;
  min-height: 100dvh;
  bottom: auto;
}

.lb-overlay--mobile .lb-viewing-shell {
  /*
   * Wichtig: definite Breite/Höhe geben. Die Crossfade-Layer sind absolut
   * positioniert und tragen NICHTS zur intrinsischen Größe der Bühne bei –
   * ohne diese Vorgabe kollabiert .lb-fade-stage (width:100%) auf 0 Breite,
   * und der Rahmen schrumpft auf seine 20px Padding (schmaler Streifen).
   */
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
}

/* Bühne füllt die (jetzt definite) Shell vollständig aus. */
.lb-overlay--mobile .lb-fade-stage {
  width: 100%;
}

/* Mobil-Portrait: Icons liegen über dem Bild, daher nur ein kleiner Displayrand. */
.lb-overlay--portrait {
  padding: 8px 12px;
}

.lb-overlay--portrait .lb-fade-stage {
  height: calc(100dvh - 8px - 8px);
  max-height: calc(100dvh - 8px - 8px);
}

/*
 * Mobil-Landscape: Buttons sitzen in den Ecken als Overlay. Die Bühne reserviert
 * keinen Platz für die Icons, damit breite Bilder die Screenfläche nutzen.
 */
.lb-overlay--landscape {
  padding: 12px;
}

.lb-overlay--landscape .lb-fade-stage {
  height: calc(100dvh - 12px - 12px);
  max-height: calc(100dvh - 12px - 12px);
  max-width: 100%;
}

/* --- Mobile Icon-Buttons ------------------------------------------------ */
.lb-mnav-btn {
  position: absolute;
  z-index: 45;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  margin: 0;
  border: 0;
  background: transparent;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  cursor: pointer;
}

.lb-mnav-btn img {
  display: block;
  width: clamp(64px, 15vw, 96px);
  aspect-ratio: 2 / 1;
  height: auto;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.lb-mnav-btn .lb-mnav-arrow-img {
  width: clamp(88px, 20vw, 128px);
  height: auto;
}

.lb-mnav-btn:active img {
  transform: scale(0.92);
}

/* Portrait: zentrierte Icon-Reihe im unteren Band. */
.lb-mnav--portrait {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 45;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(18px, 8vw, 40px);
  pointer-events: none;
}

.lb-mnav--portrait .lb-mnav-btn {
  position: static;
}

/* Landscape: Ecken. */
.lb-overlay--landscape .lb-mnav-btn img,
.lb-overlay--landscape .lb-mnav-btn .lb-mnav-arrow-img {
  width: 80px;
  height: auto;
}

.lb-mnav--ls-info {
  top: 6px;
  left: 8px;
}

.lb-mnav--ls-close {
  top: 6px;
  right: 8px;
}

.lb-mnav--ls-prev {
  bottom: 8px;
  left: 8px;
}

.lb-mnav--ls-next {
  bottom: 8px;
  right: 8px;
}
</style>
