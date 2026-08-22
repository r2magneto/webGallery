import { computed, ref } from 'vue'

const MIN_SCALE = 1
const MAX_SCALE = 4
const SNAP_EPS = 1.02
const DOUBLE_TAP_MS = 280
const DOUBLE_TAP_PX = 28
const DOUBLE_TAP_SCALE = 2.6
const GESTURE_OPTS = { capture: true, passive: false }

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n))
}

function touchDistance(a, b) {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
}

function imageAreaEl() {
    return (
      document.querySelector(
        '.lb-overlay .lb-fade-layer:not(.lb-fade-leave-active) .lb-zoom-layer',
      ) ||
      document.querySelector('.lb-overlay .lb-zoom-layer') ||
      document.querySelector('.lb-overlay .lb-img-area')
    )
}

function isChromeTarget(target) {
  return target instanceof Element && Boolean(target.closest('.lb-mnav-btn, .lb-mnav'))
}

/**
 * Pinch/pan only on the lightbox image. Buttons stay untransformed in a sibling layer.
 * iOS: native page-zoom is cancelled via GestureEvent.preventDefault().
 */
export function useLightboxPinchZoom({ isEnabled = () => true } = {}) {
  const scale = ref(1)
  const tx = ref(0)
  const ty = ref(0)
  const smooth = ref(false)

  const isZoomed = computed(() => scale.value > SNAP_EPS)

  const style = computed(() => ({
    transform: `translate3d(${tx.value}px, ${ty.value}px, 0) scale(${scale.value})`,
    transformOrigin: '0 0',
    transition: smooth.value ? 'transform 180ms ease-out' : 'none',
    willChange: isZoomed.value || smooth.value ? 'transform' : 'auto',
  }))

  let pinching = false
  let panning = false
  let usingGestureApi = false
  let startScale = 1
  let startTx = 0
  let startTy = 0
  let startDist = 0
  let startMidX = 0
  let startMidY = 0
  let startRect = null
  let panX = 0
  let panY = 0
  let panMoved = false
  let lastTapAt = 0
  let lastTapX = 0
  let lastTapY = 0
  let gestureActive = false
  let suppressClickUntil = 0
  let smoothTimer = 0
  let gesturesBound = false

  function clearSmoothTimer() {
    if (smoothTimer) {
      window.clearTimeout(smoothTimer)
      smoothTimer = 0
    }
  }

  function setSmoothBriefly() {
    smooth.value = true
    clearSmoothTimer()
    smoothTimer = window.setTimeout(() => {
      smoothTimer = 0
      smooth.value = false
    }, 200)
  }

  function snapHome(animate) {
    if (animate) setSmoothBriefly()
    else smooth.value = false
    scale.value = 1
    tx.value = 0
    ty.value = 0
  }

  function reset(options = {}) {
    pinching = false
    panning = false
    usingGestureApi = false
    gestureActive = false
    panMoved = false
    snapHome(Boolean(options.animate))
  }

  function shouldSuppressClick() {
    return Date.now() < suppressClickUntil
  }

  function markClickSuppress() {
    suppressClickUntil = Date.now() + 420
  }

  function applyScaleAt(nextScale, midX, midY, originX, originY, rect, fromScale, fromTx, fromTy) {
    const localX = (originX - rect.left) / fromScale
    const localY = (originY - rect.top) / fromScale
    const layoutLeft = rect.left - fromTx
    const layoutTop = rect.top - fromTy
    scale.value = nextScale
    tx.value = midX - layoutLeft - localX * nextScale
    ty.value = midY - layoutTop - localY * nextScale
  }

  function beginPinch(midX, midY, dist) {
    lastTapAt = 0
    panning = false
    pinching = true
    gestureActive = true
    startScale = scale.value
    startTx = tx.value
    startTy = ty.value
    startDist = dist
    startMidX = midX
    startMidY = midY
    startRect = imageAreaEl()?.getBoundingClientRect() ?? null
  }

  function onTouchStart(e) {
    if (!isEnabled() || isChromeTarget(e.target)) return
    smooth.value = false
    if (e.touches.length >= 2) {
      if (!usingGestureApi) {
        const t0 = e.touches[0]
        const t1 = e.touches[1]
        beginPinch(
          (t0.clientX + t1.clientX) / 2,
          (t0.clientY + t1.clientY) / 2,
          touchDistance(t0, t1),
        )
      }
      e.preventDefault()
      return
    }
    if (e.touches.length === 1 && scale.value > SNAP_EPS) {
      panning = true
      pinching = false
      gestureActive = false
      panMoved = false
      panX = e.touches[0].clientX
      panY = e.touches[0].clientY
      startTx = tx.value
      startTy = ty.value
    }
  }

  function onTouchMove(e) {
    if (!isEnabled()) return
    if (usingGestureApi) {
      e.preventDefault()
      return
    }
    if (pinching && e.touches.length >= 2) {
      const t0 = e.touches[0]
      const t1 = e.touches[1]
      if (startRect && startDist >= 10) {
        applyScaleAt(
          clamp(startScale * (touchDistance(t0, t1) / startDist), MIN_SCALE, MAX_SCALE),
          (t0.clientX + t1.clientX) / 2,
          (t0.clientY + t1.clientY) / 2,
          startMidX,
          startMidY,
          startRect,
          startScale,
          startTx,
          startTy,
        )
      }
      e.preventDefault()
      return
    }
    if (panning && e.touches.length === 1) {
      const dx = e.touches[0].clientX - panX
      const dy = e.touches[0].clientY - panY
      if (!panMoved && Math.hypot(dx, dy) < 10) return
      panMoved = true
      gestureActive = true
      tx.value = startTx + dx
      ty.value = startTy + dy
      e.preventDefault()
    }
  }

  function finishGesture() {
    if (scale.value <= SNAP_EPS) snapHome(true)
    if (gestureActive) markClickSuppress()
    pinching = false
    panning = false
    usingGestureApi = false
    gestureActive = false
  }

  function onTouchEnd(e) {
    if (!isEnabled()) return
    if (pinching) {
      if (e.touches.length >= 2) return
      if (e.touches.length === 1 && scale.value > SNAP_EPS) {
        pinching = false
        usingGestureApi = false
        panning = true
        panMoved = true
        panX = e.touches[0].clientX
        panY = e.touches[0].clientY
        startTx = tx.value
        startTy = ty.value
        markClickSuppress()
        return
      }
      finishGesture()
      return
    }
    if (panning) {
      if (e.touches.length !== 0) return
      if (!panMoved) {
        panning = false
        return
      }
      finishGesture()
      return
    }
    if (isChromeTarget(e.target)) return
    if (e.touches.length !== 0) return
    if (e.changedTouches.length !== 1) return
    const t = e.changedTouches[0]
    const onImage =
      t.target instanceof Element && t.target.closest('.lb-img-area, .lb-main-img')
    if (!onImage) return
    const now = Date.now()
    const isDoubleTap =
      now - lastTapAt < DOUBLE_TAP_MS &&
      Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY) < DOUBLE_TAP_PX
    lastTapAt = now
    lastTapX = t.clientX
    lastTapY = t.clientY
    if (!isDoubleTap) return
    lastTapAt = 0
    const el = imageAreaEl()
    if (!el) return
    markClickSuppress()
    if (scale.value > SNAP_EPS) snapHome(true)
    else {
      const rect = el.getBoundingClientRect()
      setSmoothBriefly()
      applyScaleAt(
        DOUBLE_TAP_SCALE,
        t.clientX,
        t.clientY,
        t.clientX,
        t.clientY,
        rect,
        scale.value,
        tx.value,
        ty.value,
      )
    }
  }

  function onGestureStart(e) {
    if (!document.querySelector('.lb-overlay')) return
    e.preventDefault()
    if (!isEnabled() || isChromeTarget(e.target)) return
    usingGestureApi = true
    const rect = imageAreaEl()?.getBoundingClientRect()
    const midX = Number.isFinite(e.clientX) ? e.clientX : rect ? rect.left + rect.width / 2 : 0
    const midY = Number.isFinite(e.clientY) ? e.clientY : rect ? rect.top + rect.height / 2 : 0
    beginPinch(midX, midY, 1)
  }

  function onGestureChange(e) {
    if (!document.querySelector('.lb-overlay')) return
    e.preventDefault()
    if (!isEnabled() || !usingGestureApi || !startRect) return
    const midX = Number.isFinite(e.clientX) ? e.clientX : startMidX
    const midY = Number.isFinite(e.clientY) ? e.clientY : startMidY
    applyScaleAt(
      clamp(startScale * (e.scale || 1), MIN_SCALE, MAX_SCALE),
      midX,
      midY,
      startMidX,
      startMidY,
      startRect,
      startScale,
      startTx,
      startTy,
    )
  }

  function onGestureEnd(e) {
    if (!document.querySelector('.lb-overlay')) return
    e.preventDefault()
    if (usingGestureApi || pinching) finishGesture()
  }

  function attach() {
    if (gesturesBound) return
    gesturesBound = true
    document.documentElement.classList.add('lb-pinch-lock')
    window.addEventListener('gesturestart', onGestureStart, GESTURE_OPTS)
    window.addEventListener('gesturechange', onGestureChange, GESTURE_OPTS)
    window.addEventListener('gestureend', onGestureEnd, GESTURE_OPTS)
  }

  function detach() {
    if (!gesturesBound) return
    gesturesBound = false
    document.documentElement.classList.remove('lb-pinch-lock')
    window.removeEventListener('gesturestart', onGestureStart, GESTURE_OPTS)
    window.removeEventListener('gesturechange', onGestureChange, GESTURE_OPTS)
    window.removeEventListener('gestureend', onGestureEnd, GESTURE_OPTS)
    pinching = false
    panning = false
    usingGestureApi = false
    gestureActive = false
    clearSmoothTimer()
  }

  return {
    scale,
    style,
    isZoomed,
    reset,
    attach,
    detach,
    shouldSuppressClick,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}
