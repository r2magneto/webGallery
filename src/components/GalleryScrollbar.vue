<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { getLenis, resizeLenis } from '../lenisClient.js'

const props = defineProps({
  /** false z. B. bei Lightbox oder leerer Galerie */
  active: {
    type: Boolean,
    default: true,
  },
})

const trackRef = ref(null)

const thumbHeightPx = ref(48)
const thumbTopPx = ref(0)

/** Invalidiert abhängige Computed bei Layout-/Viewport-Änderungen (ohne Lenis-Scroll) */
const layoutTick = ref(0)

const isDragging = ref(false)
const trackHovered = ref(false)
/** Y-Offset vom Daumen-Oberkante zum Zeiger beim Pointer-Down (0…Daumenhöhe) */
const dragGrabOffsetY = ref(0)

const DEBUG_SCROLLBAR_FRAME = false

const thumbColor = '#ffde00'

const MIN_THUMB_H = 40
/** Sichtbare Kapsel — halb so schmal wie zuvor (war 12px) */
const THUMB_WIDTH_PX = 6
/** Trefferzone volle Schienenbreite — leicht zu greifen */
const TRACK_HIT_W_PX = 22

let unsubscribeLenis = null
let contentResizeObserver = null
let scrollRafId = 0
let contentResizeRafId = 0

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function cancelPendingScrollSync() {
  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId)
    scrollRafId = 0
  }
}

/**
 * Kapsel-Position ausschließlich aus Lenis (kein document.documentElement.scrollHeight).
 * limit.y = maximale Scroll-Distanz, scroll = aktueller Wert (entspricht dem sichtbaren Stand inkl. Smoothing).
 */
function syncThumbFromLenis(lenis) {
  const trackEl = trackRef.value
  if (!lenis || !trackEl || !props.active) return
  if (isDragging.value) return

  const limitY = lenis.dimensions.limit.y
  const scrollY = lenis.scroll
  const viewH = window.innerHeight
  const trackH = trackEl.getBoundingClientRect().height
  if (trackH <= 0) return

  const totalExtent = limitY + viewH
  const thumbH = Math.max(
    MIN_THUMB_H,
    totalExtent > 0
      ? Math.min(trackH * (viewH / totalExtent), trackH)
      : trackH,
  )

  thumbHeightPx.value = thumbH

  const travel = Math.max(0, trackH - thumbH)
  const progress = limitY > 0 ? clamp(scrollY / limitY, 0, 1) : 0
  thumbTopPx.value = progress * travel
}

/**
 * Einziger UI-Pfad für Wheel/Trackpad/Program-Scroll: lenis → (rAF) → Kapsel.
 * Bündelt DOM-Updates pro Frame (Punkt 4: ein sauberer Takt statt vieler feuert pro Lenis-emit).
 */
function onLenisScroll() {
  if (!props.active) return
  if (isDragging.value) return
  if (scrollRafId) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = 0
    const L = getLenis()
    if (L) syncThumbFromLenis(L)
  })
}

function onWindowResize() {
  resizeLenis()
  layoutTick.value++
  const L = getLenis()
  if (L && !isDragging.value) syncThumbFromLenis(L)
}

/** Layout-Inhalt gewachsen/geschrumpft (z. B. Bilder): Dimensions neu für limit.y */
function onContentResize() {
  if (contentResizeRafId) return
  contentResizeRafId = requestAnimationFrame(() => {
    contentResizeRafId = 0
    resizeLenis()
    layoutTick.value++
    const L = getLenis()
    if (L && !isDragging.value) syncThumbFromLenis(L)
  })
}

function applyDragFromPointer(clientY) {
  const lenis = getLenis()
  const trackEl = trackRef.value
  if (!lenis || !trackEl || !props.active) return

  const limitY = lenis.dimensions.limit.y
  const rect = trackEl.getBoundingClientRect()
  const th = thumbHeightPx.value
  const travel = Math.max(1e-6, rect.height - th)
  const yThumb = clientY - rect.top - dragGrabOffsetY.value
  const clampedTop = clamp(yThumb, 0, travel)

  thumbTopPx.value = clampedTop
  const targetScroll = limitY > 0 ? (clampedTop / travel) * limitY : 0
  lenis.scrollTo(targetScroll, { immediate: true, force: true })
}

function onThumbPointerDown(e) {
  const lenis = getLenis()
  if (!lenis || !props.active) return

  e.preventDefault()
  e.stopPropagation()

  const id = e.pointerId
  const target = e.currentTarget
  const trackEl = trackRef.value
  if (!(target instanceof HTMLElement) || !trackEl) return

  cancelPendingScrollSync()

  resizeLenis()

  lenis.stop()

  const rect = trackEl.getBoundingClientRect()
  const relativeY = e.clientY - rect.top
  dragGrabOffsetY.value = clamp(
    relativeY - thumbTopPx.value,
    0,
    thumbHeightPx.value,
  )

  isDragging.value = true

  try {
    target.setPointerCapture(id)
  } catch (_) {
    /* noop */
  }

  applyDragFromPointer(e.clientY)

  const opts = { passive: true, capture: true }
  const onMove = (ev) => {
    if (ev.pointerId !== id) return
    applyDragFromPointer(ev.clientY)
  }

  const onUp = (ev) => {
    if (ev.pointerId !== id) return
    window.removeEventListener('pointermove', onMove, opts)
    window.removeEventListener('pointerup', onUp, opts)
    window.removeEventListener('pointercancel', onUp, opts)
    try {
      target.releasePointerCapture(id)
    } catch (_) {
      /* noop */
    }

    isDragging.value = false
    dragGrabOffsetY.value = 0

    lenis.start()
    resizeLenis()
    requestAnimationFrame(() => {
      resizeLenis()
      const L = getLenis()
      if (L) syncThumbFromLenis(L)
    })
  }

  window.addEventListener('pointermove', onMove, opts)
  window.addEventListener('pointerup', onUp, opts)
  window.addEventListener('pointercancel', onUp, opts)
}

const thumbClass = computed(() => ({
  'gallery-scrollbar-thumb': true,
  'gallery-scrollbar-thumb--drag': isDragging.value,
  'gallery-scrollbar-thumb--hover':
    trackHovered.value && !isDragging.value,
  'gallery-scrollbar-thumb--debug': DEBUG_SCROLLBAR_FRAME,
}))

const hitThumbStyle = computed(() => ({
  height: `${thumbHeightPx.value}px`,
  minHeight: `${MIN_THUMB_H}px`,
  width: `${TRACK_HIT_W_PX}px`,
  transform: `translate3d(-50%, ${thumbTopPx.value}px, 0)`,
}))

const innerThumbStyle = computed(() => ({
  width: `${THUMB_WIDTH_PX}px`,
  minWidth: `${THUMB_WIDTH_PX}px`,
  backgroundColor: thumbColor,
  opacity: 1,
}))

const showChrome = computed(() => {
  layoutTick.value
  const L = getLenis()
  if (!props.active || !L) return false
  return L.dimensions.limit.y > 0.5
})

watch(
  () => props.active,
  (a) => {
    if (a) {
      cancelPendingScrollSync()
      resizeLenis()
      requestAnimationFrame(() => {
        const L = getLenis()
        if (L) syncThumbFromLenis(L)
      })
    }
  },
)

onMounted(() => {
  const lenis = getLenis()
  if (lenis) {
    unsubscribeLenis = lenis.on('scroll', onLenisScroll)
  }
  window.addEventListener('resize', onWindowResize, { passive: true })

  if (typeof ResizeObserver !== 'undefined') {
    contentResizeObserver = new ResizeObserver(() => onContentResize())
    contentResizeObserver.observe(document.body)
    contentResizeObserver.observe(document.documentElement)
  }

  resizeLenis()
  requestAnimationFrame(() => {
    resizeLenis()
    const L = getLenis()
    if (L) syncThumbFromLenis(L)
  })
})

onBeforeUnmount(() => {
  cancelPendingScrollSync()
  if (contentResizeRafId) {
    cancelAnimationFrame(contentResizeRafId)
    contentResizeRafId = 0
  }
  window.removeEventListener('resize', onWindowResize)
  contentResizeObserver?.disconnect()
  contentResizeObserver = null
  if (typeof unsubscribeLenis === 'function') {
    unsubscribeLenis()
    unsubscribeLenis = null
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="showChrome && active"
      ref="trackRef"
      class="gallery-scrollbar-track"
      role="scrollbar"
      aria-orientation="vertical"
      aria-hidden="true"
    >
      <div
        class="gallery-scrollbar-thumb-hit"
        :class="{ 'gallery-scrollbar-thumb-hit--drag': isDragging }"
        :style="hitThumbStyle"
        @pointerdown.stop="onThumbPointerDown"
        @pointerenter="trackHovered = true"
        @pointerleave="trackHovered = false"
      >
        <div :class="thumbClass" :style="innerThumbStyle" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gallery-scrollbar-track {
  position: fixed;
  z-index: 9999;
  top: 24px;
  bottom: 24px;
  right: 14px;
  width: 22px;
  pointer-events: none;
  touch-action: none;
  opacity: 1;
}

.gallery-scrollbar-thumb-hit {
  position: absolute;
  left: 50%;
  top: 0;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: stretch;
  pointer-events: auto;
  cursor: grab;
  background: transparent;
}

.gallery-scrollbar-thumb-hit--drag {
  cursor: grabbing;
}

.gallery-scrollbar-thumb {
  flex: 0 0 auto;
  align-self: stretch;
  width: 6px;
  min-width: 6px;
  box-sizing: border-box;
  border-radius: 100vw;
  opacity: 1;
  box-shadow:
    0 0 0 1px rgb(255 222 0 / 0.5),
    0 2px 14px rgb(0 0 0 / 0.5);
  transition:
    width 0.18s ease,
    min-width 0.18s ease,
    box-shadow 0.18s ease,
    filter 0.18s ease;
}

.gallery-scrollbar-thumb--hover {
  width: 7px !important;
  min-width: 7px !important;
  filter: brightness(1.05);
  box-shadow:
    0 0 0 1px rgb(255 222 0 / 0.78),
    0 0 28px rgb(255 222 0 / 0.5),
    0 4px 18px rgb(0 0 0 / 0.55);
}

.gallery-scrollbar-thumb--drag {
  width: 7px !important;
  min-width: 7px !important;
  filter: brightness(1.1);
  box-shadow:
    0 0 0 1px rgb(255 222 0 / 0.92),
    0 0 32px rgb(255 222 0 / 0.58),
    0 6px 22px rgb(0 0 0 / 0.55);
}

.gallery-scrollbar-thumb--debug {
  border: 2px solid red;
}
</style>
