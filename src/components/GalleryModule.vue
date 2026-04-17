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
import { squareRowHeightPx } from '../utils/gridAspect.js'

const props = defineProps({
  /** Layout-JSON im public-Ordner (z. B. layout.json). */
  configPath: {
    type: String,
    default: 'layout.json',
  },
  /** Gespeicherter Fenster-Scroll für diese Galerie (px). */
  initialScrollY: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['saveScroll'])

/** Padding: 4 % links/rechts; oben/unten je 0,5 % Bandhöhe (2× → ~99 % Bildhöhe) */
const LB_PAD_X_FRAC = 0.04
const LB_PAD_Y_FRAC = 0.005
/** Gelbe Outline in der Vollansicht (Morph-Ende = Lightbox) */
const LB_FULL_OUTLINE_PX = 1
/** Abstand Caption-Overlay zum linken/unteren Bildrand (im Bild-Wrapper) */
const LB_CAPTION_INSET = 16
const LB_VIEWPORT_W_FRAC = 0.94
const LB_VIEWPORT_H_FRAC = 0.88

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

/** Kachel-Parallax: seitlich etwas weniger, vertikal etwas stärker */
const PARALLAX_MAX_PX_X = 52
const PARALLAX_MAX_PX_Y = 62
const PARALLAX_LERP = 0.065

/** Schließen-Zone: kompaktes Inline-SVG als data-URL (Base64, gute Browser-Kompatibilität) */
const LB_CLOSE_CURSOR = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<path fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" d="M9 9l14 14M23 9L9 23"/>' +
    '</svg>'
  return `url("data:image/svg+xml;base64,${btoa(svg)}") 16 16, pointer`
})()

function svgCursorFromMarkup(svgMarkup) {
  return `url("data:image/svg+xml;base64,${btoa(svgMarkup)}") 16 16, pointer`
}

/** Rand-Scroll-Zonen: schlichte Pfeile (zinc) */
const SCROLL_CURSOR_UP = svgCursorFromMarkup(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<path fill="none" stroke="#a1a1aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M16 24V9M9 16l7-7 7 7"/>' +
    '</svg>',
)
const SCROLL_CURSOR_DOWN = svgCursorFromMarkup(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<path fill="none" stroke="#a1a1aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M16 8v15M9 16l7 7 7-7"/>' +
    '</svg>',
)

/** Langsames Grundtempo an der vertikalen Mitte (untere Hälfte: sanft nach unten) */
const SCROLL_BASE_PX_S = 130
/** Max. Geschwindigkeit am Rand — „Turbo“ für sehr lange Galerien */
const SCROLL_MAX_PX_S = 14000
/**
 * Joystick-Kurve: hohe Potenz = exponentiell mehr Speed je weiter von der Mitte
 */
const SCROLL_EDGE_POWER = 3.65
/** Lerp Soll-↔Ist-Geschwindigkeit (hoch = schnelleres Einpendeln, weiterhin geglättet) */
const SCROLL_VEL_RESPONSIVE = 5.8
/** Ausrollen nach Loslassen */
const SCROLL_FRICTION = 5.4
const SCROLL_VEL_STOP = 5

/** Hintergrund-Raster: ~12,5 % der Scroll-Distanz → wirkt „tiefer“ als die Kachelebene */
const GRID_SCROLL_PARALLAX = 0.125
/** Maus-Drift Raster: höher als Kachel-Anteil → Hintergrund bewegt sich insgesamt spürbarer */
const GRID_MOUSE_PARALLAX_FRAC = 0.26

const layout = ref([])
const loadState = ref('loading')
const revealTiles = ref(false)

const viewerRootRef = ref(null)
const gridHostRef = ref(null)
const gridHostWidth = ref(0)
let gridHostResizeObserver = null

const gridRowHeight = computed(() =>
  squareRowHeightPx(gridHostWidth.value || 960),
)

function bindGridHostResizeObserver() {
  gridHostResizeObserver?.disconnect()
  const el = gridHostRef.value
  if (!el) return
  gridHostWidth.value = el.offsetWidth
  if (typeof ResizeObserver !== 'undefined') {
    gridHostResizeObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width
      if (w != null && w > 0) gridHostWidth.value = w
    })
    gridHostResizeObserver.observe(el)
  }
}

const parallaxX = ref(0)
const parallaxY = ref(0)
const parallaxTargetX = ref(0)
const parallaxTargetY = ref(0)
let parallaxRafId = null

const gridParallaxScrollY = ref(0)
let gridParallaxScrollRafId = null

const gridParallaxMouseX = ref(0)
const gridParallaxMouseY = ref(0)
const gridParallaxMouseTargetX = ref(0)
const gridParallaxMouseTargetY = ref(0)

const gridParallaxLayerStyle = computed(() => ({
  transform: `translate3d(${gridParallaxMouseX.value}px, ${gridParallaxMouseY.value - gridParallaxScrollY.value}px, 0)`,
}))

function syncGridParallaxFromScroll() {
  gridParallaxScrollY.value = window.scrollY * GRID_SCROLL_PARALLAX
}

function scheduleGridParallaxFromScroll() {
  if (gridParallaxScrollRafId != null) return
  gridParallaxScrollRafId = requestAnimationFrame(() => {
    gridParallaxScrollRafId = null
    syncGridParallaxFromScroll()
  })
}

function attachGridScrollParallaxListener() {
  window.addEventListener('scroll', scheduleGridParallaxFromScroll, {
    passive: true,
  })
}

function detachGridScrollParallaxListener() {
  window.removeEventListener('scroll', scheduleGridParallaxFromScroll)
  if (gridParallaxScrollRafId != null) {
    cancelAnimationFrame(gridParallaxScrollRafId)
    gridParallaxScrollRafId = null
  }
}

function onWindowMouseMoveForGridParallax(e) {
  const el = viewerRootRef.value
  if (
    !el ||
    loadState.value !== 'idle' ||
    layout.value.length === 0
  ) {
    return
  }
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const nx = (e.clientX - rect.left) / rect.width - 0.5
  const ny = (e.clientY - rect.top) / rect.height - 0.5
  const ax = GRID_MOUSE_PARALLAX_FRAC * 2 * PARALLAX_MAX_PX_X
  const ay = GRID_MOUSE_PARALLAX_FRAC * 2 * PARALLAX_MAX_PX_Y
  gridParallaxMouseTargetX.value = -nx * ax
  gridParallaxMouseTargetY.value = -ny * ay
}

function attachGridMouseParallaxListener() {
  window.addEventListener('mousemove', onWindowMouseMoveForGridParallax, {
    passive: true,
  })
}

function detachGridMouseParallaxListener() {
  window.removeEventListener('mousemove', onWindowMouseMoveForGridParallax)
}

/** Viewport-Rand-Scroll (Maus halten) */
let lastPointerClientY = 0
let scrollDragActive = false
let scrollVelPxS = 0
let scrollPhysicsRafId = null
let lastScrollPhysicsTs = 0

/** null = zu */
const lightboxIndex = ref(null)
/** idle | opening | viewing | closing */
const viewerMode = ref('idle')

const morphSrc = ref('')
const morphShellStyle = ref({})
const morphInnerObjectFit = ref('cover')
const morphShowCaption = ref(false)
const morphCaptionText = ref('')
const morphInnerTransition = ref('none')
const lbContentImgRef = ref(null)
const lbContentWrapRef = ref(null)
const morphShellRef = ref(null)
const morphImgRef = ref(null)

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

/** Rohtext inkl. Zeilenumbrüche (Anzeige); leer nur wenn trim() leer */
const currentLightboxCaptionRaw = computed(() => {
  const i = lightboxIndex.value
  if (i === null || i < 0 || i >= layout.value.length) return ''
  const v = layout.value[i]?.caption
  return v != null ? String(v) : ''
})

const hasLightboxCaption = computed(
  () => currentLightboxCaptionRaw.value.trim() !== '',
)

const parallaxLayerStyle = computed(() => ({
  transform: `translate3d(${parallaxX.value}px, ${parallaxY.value}px, 0)`,
}))

function clearMorphTimer() {
  if (morphFinishTimer != null) {
    clearTimeout(morphFinishTimer)
    morphFinishTimer = null
  }
}

function escapeAttrSelectorValue(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Lightbox ↔ Grid: aktives Thumbnail vertikal in den Viewport zentrieren (Zoom-Back trifft sichtbare Kachel). */
function scrollThumbnailIntoViewCentered(index) {
  if (index == null || index < 0 || index >= layout.value.length) return
  const id = layout.value[index]?.i
  if (id == null) return
  const el = document.querySelector(
    `[data-viewer-tile-id="${escapeAttrSelectorValue(id)}"]`,
  )
  if (!(el instanceof HTMLElement)) return
  const r = el.getBoundingClientRect()
  if (r.height <= 0 && r.width <= 0) return
  const cy = r.top + r.height / 2
  const target = window.scrollY + cy - window.innerHeight / 2
  window.scrollTo({
    top: Math.max(0, target),
    behavior: 'smooth',
  })
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
    captionText = '',
    objectFit = 'cover',
    appendCloseOpacityFade = false,
  } = {},
) {
  if (!r) return
  morphShowCaption.value = showCaption
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
    display: 'flex',
    flexDirection: 'column',
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
    if (im.naturalWidth > 0 && im.naturalHeight > 0) {
      naturalBySrc[src] = { w: im.naturalWidth, h: im.naturalHeight }
    }
  }
  im.src = src
}

function onLightboxImgLoad(e) {
  const el = e.target
  const src = el?.currentSrc || el?.src
  if (!src || !el.naturalWidth) return
  naturalBySrc[src] = { w: el.naturalWidth, h: el.naturalHeight }
}

/**
 * Vollansicht: gelber Rahmen umschließt nur das Bild (Caption als Overlay im Bild).
 */
function lightboxLayoutForIndex(index) {
  if (index == null || index < 0 || index >= layout.value.length) return null
  const item = layout.value[index]
  const src = item?.src
  const slotMaxW = window.innerWidth * LB_VIEWPORT_W_FRAC
  const slotMaxH = window.innerHeight * LB_VIEWPORT_H_FRAC
  const dim = src ? naturalBySrc[src] : null
  let nw = dim?.w
  let nh = dim?.h
  if (!nw || !nh) {
    nw = 1600
    nh = 900
  }
  const innerMaxW = slotMaxW * (1 - 2 * LB_PAD_X_FRAC)
  const innerMaxH = slotMaxH * (1 - 2 * LB_PAD_Y_FRAC)
  const { w: iw, h: ih } = fitContain(nw, nh, innerMaxW, innerMaxH)
  const bandW = Math.min(
    slotMaxW,
    Math.ceil(iw / (1 - 2 * LB_PAD_X_FRAC)),
  )
  const bandH = Math.min(
    slotMaxH,
    Math.ceil(ih / (1 - 2 * LB_PAD_Y_FRAC)),
  )
  const shellW = bandW
  const shellH = bandH
  return {
    shellW,
    shellH,
    bandW,
    bandH,
  }
}

function lightboxFrameCss(index) {
  const L = lightboxLayoutForIndex(index)
  if (!L) return {}
  return {
    width: `${L.shellW}px`,
    height: `${L.shellH}px`,
    minHeight: `${L.shellH}px`,
    maxWidth: 'min(95vw, 100%)',
    boxSizing: 'border-box',
  }
}

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
  morphShellOpacity.value = 1
  lbBackdropOpacity.value = 1
  const src = layout.value[index]?.src ?? ''
  prefetchNatural(src)

  const imgEl = event?.currentTarget?.querySelector('.viewer-tile-img')
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

  const capRaw =
    layout.value[index]?.caption != null
      ? String(layout.value[index].caption)
      : ''
  const cap = capRaw.trim()
  let nw = imgEl.naturalWidth
  let nh = imgEl.naturalHeight
  if ((!nw || !nh) && src && naturalBySrc[src]) {
    nw = naturalBySrc[src].w
    nh = naturalBySrc[src].h
  }
  if (!nw || !nh) {
    nw = 1600
    nh = 900
  }
  if (src && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
    naturalBySrc[src] = { w: imgEl.naturalWidth, h: imgEl.naturalHeight }
  }

  const L = lightboxLayoutForIndex(index)
  if (!L) {
    lightboxIndex.value = index
    viewerMode.value = 'viewing'
    return
  }
  const { shellW, shellH } = L
  const finalLeft = (window.innerWidth - shellW) / 2
  const finalTop = (window.innerHeight - shellH) / 2
  const morphStartH = thumb.height

  morphSrc.value = src
  lightboxIndex.value = index
  viewerMode.value = 'opening'

  setMorphShell(
    { top: thumb.top, left: thumb.left, width: thumb.width, height: morphStartH },
    {
      withTransition: false,
      morphKind: 'open',
      outlinePx: LB_FULL_OUTLINE_PX,
      showCaption: !!cap,
      captionText: capRaw,
      objectFit: 'cover',
    },
  )

  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMorphShell(
          { top: finalTop, left: finalLeft, width: shellW, height: shellH },
          {
            withTransition: true,
            morphKind: 'open',
            outlinePx: LB_FULL_OUTLINE_PX,
            showCaption: !!cap,
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

  if (!bigRect && lightboxIndex.value != null) {
    const L = lightboxLayoutForIndex(lightboxIndex.value)
    if (L) {
      const { shellW, shellH } = L
      bigRect = {
        top: Math.round((window.innerHeight - shellH) / 2),
        left: Math.round((window.innerWidth - shellW) / 2),
        width: shellW,
        height: shellH,
      }
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
  morphSrc.value = currentLightboxSrc.value

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

  if (hasLightboxCaption.value) {
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

const lightboxBackdropStyle = computed(() => ({
  opacity: lbBackdropOpacity.value,
  transitionProperty: 'opacity',
  transitionDuration: `${MORPH_CLOSE_FADE_MS}ms`,
  transitionTimingFunction: 'ease-out',
}))

function onParallaxMove(e) {
  const el = viewerRootRef.value
  if (!el || lightboxOpen.value) return
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const nx = (e.clientX - rect.left) / rect.width - 0.5
  const ny = (e.clientY - rect.top) / rect.height - 0.5
  parallaxTargetX.value = -nx * 2 * PARALLAX_MAX_PX_X
  parallaxTargetY.value = -ny * 2 * PARALLAX_MAX_PX_Y
}

function onParallaxLeave() {
  parallaxTargetX.value = 0
  parallaxTargetY.value = 0
  gridParallaxMouseTargetX.value = 0
  gridParallaxMouseTargetY.value = 0
}

function parallaxTick() {
  parallaxX.value += (parallaxTargetX.value - parallaxX.value) * PARALLAX_LERP
  parallaxY.value += (parallaxTargetY.value - parallaxY.value) * PARALLAX_LERP
  gridParallaxMouseX.value +=
    (gridParallaxMouseTargetX.value - gridParallaxMouseX.value) * PARALLAX_LERP
  gridParallaxMouseY.value +=
    (gridParallaxMouseTargetY.value - gridParallaxMouseY.value) * PARALLAX_LERP
  parallaxRafId = requestAnimationFrame(parallaxTick)
}

function galleryReadyForEdgeScroll() {
  return (
    layout.value.length > 0 &&
    loadState.value === 'idle' &&
    !lightboxOpen.value
  )
}

/**
 * Joystick: obere Hälfte nach oben, untere nach unten. Mitte: SCROLL_BASE_PX_S;
 * zum Rand Potenzkurve → hohe Endgeschwindigkeit, Übergang per SCROLL_VEL_RESPONSIVE geglättet.
 */
function scrollDriveFromClientY(clientY) {
  const h = window.innerHeight
  if (h <= 0) return { targetVel: 0, cursorHalf: 'lower' }
  const center = h * 0.5
  const halfLen = center
  const distNorm = halfLen > 0 ? Math.abs(clientY - center) / halfLen : 0
  const blend = Math.pow(Math.min(1, Math.max(0, distNorm)), SCROLL_EDGE_POWER)
  const mag =
    SCROLL_BASE_PX_S + blend * (SCROLL_MAX_PX_S - SCROLL_BASE_PX_S)
  const dir = clientY < center ? -1 : 1
  const targetVel = dir * mag
  const cursorHalf = clientY < center ? 'upper' : 'lower'
  return { targetVel, cursorHalf }
}

function clearBodyScrollCursor() {
  document.body.style.cursor = ''
}

function updateEdgeScrollCursorFromEvent(e) {
  if (!galleryReadyForEdgeScroll()) {
    clearBodyScrollCursor()
    return
  }
  const el = e.target
  if (el instanceof Element && el.closest('.viewer-tile-btn')) {
    clearBodyScrollCursor()
    return
  }
  const { cursorHalf } = scrollDriveFromClientY(e.clientY)
  document.body.style.cursor =
    cursorHalf === 'upper' ? SCROLL_CURSOR_UP : SCROLL_CURSOR_DOWN
}

function onWindowMouseMoveForScroll(e) {
  lastPointerClientY = e.clientY
  updateEdgeScrollCursorFromEvent(e)
}

function onWindowMouseDownForScroll(e) {
  if (!galleryReadyForEdgeScroll()) return
  if (e.button !== 0) return
  const t = e.target
  if (t instanceof Element) {
    if (t.closest('.viewer-tile-btn')) return
    if (t.closest('[role="dialog"]')) return
  }
  lastPointerClientY = e.clientY
  scrollDragActive = true
  e.preventDefault()
  ensureScrollPhysicsLoop()
}

function onWindowMouseUpForScroll() {
  scrollDragActive = false
}

function scrollPhysicsStep(ts) {
  const dt = lastScrollPhysicsTs
    ? Math.min(0.045, (ts - lastScrollPhysicsTs) / 1000)
    : 1 / 60
  lastScrollPhysicsTs = ts

  let targetVel = 0
  if (scrollDragActive && galleryReadyForEdgeScroll()) {
    targetVel = scrollDriveFromClientY(lastPointerClientY).targetVel
    const k = 1 - Math.exp(-SCROLL_VEL_RESPONSIVE * dt)
    scrollVelPxS += (targetVel - scrollVelPxS) * k
  } else {
    scrollVelPxS *= Math.exp(-SCROLL_FRICTION * dt)
  }

  const dy = scrollVelPxS * dt
  if (Math.abs(dy) >= 0.2) {
    window.scrollBy(0, dy)
  }

  const keep =
    (scrollDragActive && galleryReadyForEdgeScroll()) ||
    Math.abs(scrollVelPxS) > SCROLL_VEL_STOP
  if (keep) {
    scrollPhysicsRafId = requestAnimationFrame(scrollPhysicsStep)
  } else {
    scrollPhysicsRafId = null
    lastScrollPhysicsTs = 0
    scrollVelPxS = 0
  }
}

function ensureScrollPhysicsLoop() {
  if (scrollPhysicsRafId == null) {
    scrollPhysicsRafId = requestAnimationFrame(scrollPhysicsStep)
  }
}

function attachEdgeScrollListeners() {
  window.addEventListener('mousemove', onWindowMouseMoveForScroll)
  window.addEventListener('mousedown', onWindowMouseDownForScroll)
  window.addEventListener('mouseup', onWindowMouseUpForScroll)
  window.addEventListener('blur', onWindowMouseUpForScroll)
}

function detachEdgeScrollListeners() {
  window.removeEventListener('mousemove', onWindowMouseMoveForScroll)
  window.removeEventListener('mousedown', onWindowMouseDownForScroll)
  window.removeEventListener('mouseup', onWindowMouseUpForScroll)
  window.removeEventListener('blur', onWindowMouseUpForScroll)
  scrollDragActive = false
  clearBodyScrollCursor()
  if (scrollPhysicsRafId != null) {
    cancelAnimationFrame(scrollPhysicsRafId)
    scrollPhysicsRafId = null
    lastScrollPhysicsTs = 0
    scrollVelPxS = 0
  }
}

function restoreInitialScroll() {
  const top = Math.max(0, props.initialScrollY)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top, left: 0, behavior: 'instant' })
    })
  })
}

async function loadGalleryFromConfig() {
  lightboxIndex.value = null
  viewerMode.value = 'idle'
  clearMorphShell()
  clearMorphTimer()
  clearMorphCloseFadeTimer()
  clearCaptionFadeBeforeCloseTimer()
  lbCaptionFastHide.value = false

  if (parallaxRafId != null) {
    cancelAnimationFrame(parallaxRafId)
    parallaxRafId = null
  }

  revealTiles.value = false
  loadState.value = 'loading'
  const items = await fetchGalleryLayoutItems(props.configPath)
  layout.value = items.map((it) => ({
    ...it,
    src: resolveGalleryImageSrc(it.src, props.configPath),
  }))
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
}

onMounted(async () => {
  await loadGalleryFromConfig()
  restoreInitialScroll()

  window.addEventListener('keydown', onLightboxKeydown)
  attachEdgeScrollListeners()
  attachGridScrollParallaxListener()
  attachGridMouseParallaxListener()
  syncGridParallaxFromScroll()
  if (layout.value.length > 0) {
    parallaxRafId = requestAnimationFrame(parallaxTick)
  }
})

watch(
  () => props.configPath,
  async () => {
    await loadGalleryFromConfig()
    restoreInitialScroll()
    syncGridParallaxFromScroll()
    if (layout.value.length > 0) {
      if (parallaxRafId == null) {
        parallaxRafId = requestAnimationFrame(parallaxTick)
      }
    }
  },
)

watch(lightboxOpen, (open) => {
  if (open) {
    scrollDragActive = false
    clearBodyScrollCursor()
  }
})

watch(gridHostRef, (el) => {
  if (el) nextTick(() => bindGridHostResizeObserver())
})

watch(viewerMode, (m) => {
  if (m === 'idle') lbCaptionFastHide.value = false
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
    nextTick(() => {
      requestAnimationFrame(() => {
        scrollThumbnailIntoViewCentered(lightboxIndex.value)
      })
    })
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  emit('saveScroll', {
    configPath: props.configPath,
    scrollY: window.scrollY,
  })
  clearMorphTimer()
  clearMorphCloseFadeTimer()
  clearCaptionFadeBeforeCloseTimer()
  window.removeEventListener('keydown', onLightboxKeydown)
  detachEdgeScrollListeners()
  detachGridScrollParallaxListener()
  detachGridMouseParallaxListener()
  gridHostResizeObserver?.disconnect()
  gridHostResizeObserver = null
  if (parallaxRafId != null) {
    cancelAnimationFrame(parallaxRafId)
    parallaxRafId = null
  }
})
</script>

<template>
  <div
    ref="viewerRootRef"
    class="viewer-root relative min-h-svh w-full overflow-x-hidden bg-transparent"
    @mousemove="onParallaxMove"
    @mouseleave="onParallaxLeave"
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
        :style="gridParallaxLayerStyle"
      />
      <div
        class="viewer-bg-depth pointer-events-none"
        aria-hidden="true"
      />
      <div
        class="viewer-parallax-shell relative z-10 will-change-transform"
        :style="parallaxLayerStyle"
      >
      <div ref="gridHostRef" class="w-full px-[10%]">
      <GridLayout
        v-model:layout="layout"
        :col-num="48"
        :row-height="gridRowHeight"
        :margin="[10, 10]"
        :is-draggable="false"
        :is-resizable="false"
        :vertical-compact="false"
        :use-css-transforms="true"
        :use-style-cursor="false"
        class="viewer-grid w-full"
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
              class="viewer-tile-btn group relative z-10 block h-full w-full cursor-zoom-in border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/80"
              :data-viewer-tile-id="item.i"
              :aria-label="`Vergrößern: ${item.i}`"
              @click="openLightbox(index, $event)"
            >
              <div
                class="relative h-full w-full overflow-hidden bg-neutral-900"
              >
                <img
                  :src="item.src"
                  :alt="item.i"
                  class="viewer-tile-img pointer-events-none h-full w-full object-cover"
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
          class="fixed inset-0 z-[200] flex items-center justify-center p-4"
          :class="{ 'pointer-events-none': viewerMode === 'closing' }"
          role="dialog"
          aria-modal="true"
          aria-label="Bildansicht"
          @click.self="closeLightbox"
        >
          <div
            class="lb-backdrop absolute inset-0 z-0 bg-black/90 will-change-[opacity]"
            :style="lightboxBackdropStyle"
            aria-hidden="true"
            @click="closeLightbox"
          />

          <div
            v-if="viewerMode === 'opening' || viewerMode === 'closing'"
            ref="morphShellRef"
            class="lb-morph-shell pointer-events-none will-change-[top,left,width,height,opacity]"
            :style="[morphShellStyle, { opacity: morphShellOpacity }]"
          >
            <div
              class="flex h-full min-h-0 w-full flex-col bg-neutral-950/30"
            >
              <div
                v-if="morphInnerObjectFit === 'cover'"
                class="lb-morph-img-band lb-img-slot-cq relative min-h-0 flex-1 overflow-hidden"
              >
                <img
                  ref="morphImgRef"
                  :src="morphSrc"
                  alt=""
                  class="absolute inset-0 h-full w-full object-cover"
                  :style="{ transition: morphInnerTransition }"
                />
                <div
                  v-if="morphShowCaption"
                  class="lb-caption-overlay pointer-events-none"
                  :style="{
                    left: `${LB_CAPTION_INSET}px`,
                    bottom: `${LB_CAPTION_INSET}px`,
                    maxWidth: `calc(100% - ${LB_CAPTION_INSET * 2}px)`,
                  }"
                >
                  <div class="lb-caption-overlay-inner">
                    {{ morphCaptionText }}
                  </div>
                </div>
              </div>
              <div
                v-else
                class="lb-morph-img-band lb-img-slot-cq flex min-h-0 flex-1 items-center justify-center overflow-hidden"
              >
                <div
                  class="lb-image-frame relative z-0 inline-block max-h-full max-w-full min-h-0"
                >
                  <img
                    ref="morphImgRef"
                    :src="morphSrc"
                    alt=""
                    class="lb-morph-inner-img relative z-0 block max-h-[99%] max-w-[99%] object-contain"
                    :style="{ transition: morphInnerTransition }"
                  />
                  <div
                    v-if="morphShowCaption"
                    class="lb-caption-overlay pointer-events-none"
                    :style="{
                      left: `${LB_CAPTION_INSET}px`,
                      bottom: `${LB_CAPTION_INSET}px`,
                      maxWidth: `calc(100% - ${LB_CAPTION_INSET * 2}px)`,
                    }"
                  >
                    <div class="lb-caption-overlay-inner">
                      {{ morphCaptionText }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="viewerMode === 'viewing'"
            class="relative z-[15] flex min-h-[min(90vh,100%)] min-w-[min(95vw,100%)] max-h-[92vh] max-w-[min(95vw,100%)] items-center justify-center"
          >
            <div
              class="lb-crossfade-stack relative w-full max-w-[min(95vw,100%)]"
              style="min-height: min(88vh, 82svh)"
            >
              <Transition name="lb-navfade">
                <div
                  v-if="lightboxIndex !== null && currentLightboxSrc"
                  ref="lbContentWrapRef"
                  :key="lightboxIndex"
                  class="lb-framed lb-navslide mx-auto flex min-h-0 flex-col overflow-hidden bg-neutral-950/30 outline outline-[1px] outline-yellow-400"
                  :style="lightboxFrameCss(lightboxIndex)"
                >
                  <div
                    class="lb-img-slot lb-img-slot-cq flex min-h-0 flex-1 items-center justify-center overflow-hidden"
                  >
                    <div
                      class="lb-image-frame relative z-0 inline-block max-h-full max-w-full min-h-0"
                    >
                      <img
                        ref="lbContentImgRef"
                        :src="currentLightboxSrc"
                        alt=""
                        class="lb-main-img relative z-0 block max-h-[99%] max-w-[99%] object-contain shadow-2xl"
                        @load="onLightboxImgLoad"
                      />
                      <div
                        v-if="hasLightboxCaption"
                        class="lb-caption-overlay pointer-events-none"
                        :class="{ 'lb-caption-overlay--fast-hide': lbCaptionFastHide }"
                        :style="{
                          left: `${LB_CAPTION_INSET}px`,
                          bottom: `${LB_CAPTION_INSET}px`,
                          maxWidth: `calc(100% - ${LB_CAPTION_INSET * 2}px)`,
                        }"
                      >
                        <div class="lb-caption-overlay-inner">
                          {{ currentLightboxCaptionRaw }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>

            <div
              class="absolute inset-0 z-[40] flex w-full"
              aria-hidden="true"
            >
              <button
                type="button"
                class="lb-zone-prev h-full w-1/3 cursor-w-resize border-0 bg-transparent p-0"
                aria-label="Vorheriges Bild"
                @click.stop="prevImage"
              />
              <button
                type="button"
                class="lb-zone-close h-full w-1/3 border-0 bg-transparent p-0"
                :style="{ cursor: LB_CLOSE_CURSOR }"
                aria-label="Schließen"
                @click.stop="closeLightbox"
              />
              <button
                type="button"
                class="lb-zone-next h-full w-1/3 cursor-e-resize border-0 bg-transparent p-0"
                aria-label="Nächstes Bild"
                @click.stop="nextImage"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/*
 * Unendlich wirkendes Raster: riesige Fläche + repeat; Parallax-Translate deckt nie „Rand“ ab.
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
  will-change: transform;
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
 * linear-gradient(to right …): 0 % = links, 100 % = rechts.
 * z-index 1: über Grid (0), unter Thumbnails (.viewer-parallax-shell z-10).
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
    transparent 14%,
    rgba(0, 0, 0, 0.85) 22%,
    rgba(0, 0, 0, 0.85) 78%,
    transparent 86%,
    transparent 100%
  );
}

.viewer-grid :deep(.vue-grid-layout) {
  min-height: 100svh;
}

.viewer-grid :deep(.vue-grid-item) {
  overflow: visible;
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

/* Crossfade: Slides absolut zentriert, jeweils eigener Rahmen + Maß */
.lb-crossfade-stack {
  position: relative;
  width: 100%;
}

.lb-navslide {
  position: absolute;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  max-width: min(95vw, 100%);
  box-sizing: border-box;
}

.lb-navfade-enter-active,
.lb-navfade-leave-active {
  transition: opacity 0.3s ease;
  will-change: opacity;
}

.lb-navfade-enter-active {
  z-index: 2;
}

.lb-navfade-leave-active {
  z-index: 1;
}

.lb-navfade-enter-from,
.lb-navfade-leave-to {
  opacity: 0;
}

.lb-morph-inner-img {
  flex-shrink: 0;
}

.lb-main-img {
  width: auto;
  height: auto;
}

/* ~0,5 % Bandhöhe oben/unten, 4 % Bandbreite links/rechts — Morph & Lightbox identisch */
.lb-img-slot-cq {
  container-type: size;
  box-sizing: border-box;
  padding: 0.5cqh 4cqw;
}

.lb-caption-overlay {
  position: absolute;
  z-index: 1;
  right: auto;
  top: auto;
}

.lb-caption-overlay-inner {
  padding: 5px 14px;
  border-radius: 8px;
  text-align: left;
  font-size: 0.875rem;
  line-height: 1.4;
  color: #fafafa;
  white-space: pre-wrap;
  word-break: break-word;
  background: linear-gradient(
    to top,
    rgb(0 0 0 / 0.78) 0%,
    rgb(0 0 0 / 0.5) 50%,
    rgb(0 0 0 / 0.28) 100%
  );
  box-shadow: 0 2px 16px rgb(0 0 0 / 0.3);
}

.lb-caption-overlay--fast-hide {
  opacity: 0;
  transition: opacity 95ms ease-out;
}
</style>
