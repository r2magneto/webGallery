import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getLenis } from '../lenisClient.js'

/** Max. Scrollgeschwindigkeit (px/s) am oberen/unteren Bildschirmrand */
const GAS_MAX_PX_PER_SEC = 2600
/** Soll-Geschwindigkeit (px/s) folgt Mausposition; Lenis glättet wie beim Mausrad. */
const GAS_VEL_LERP_PER_S = 10

export function isDefaultGasPedalTarget(target) {
  if (!(target instanceof Element)) return false
  if (target.closest('.viewer-tile-btn')) return false
  if (target.closest('button, a, input, textarea, select, label')) return false
  if (target.closest('[contenteditable="true"]')) return false
  return true
}

/**
 * Hintergrund: Cursor oben/unten + Mausklick halten → Lenis-Scroll (Gaspedal).
 * @param {object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.shellRef
 * @param {() => boolean} [options.isEnabled]
 * @param {(target: EventTarget|null) => boolean} [options.isScrollTarget]
 * @param {string|null} [options.cursorClearSelector] z. B. `.viewer-tile-btn`
 */
export function useGasPedalScroll({
  shellRef,
  isEnabled = () => true,
  isScrollTarget = isDefaultGasPedalTarget,
  cursorClearSelector = null,
}) {
  const shellCursorClass = ref('')
  const gasPedalHeld = ref(false)

  let lastCursorClientY = window.innerHeight * 0.5
  let cursorIsOverBackground = false
  let wheelCursorOverrideUntil = 0
  let wheelCursorOverrideTimer = 0
  let gasVelPxPerSec = 0
  let gasRafId = 0
  let gasLastTs = 0
  let gasPointerId = -1
  let lastGasClientY = 0

  function setWheelCursorOverride(dir) {
    if (!cursorIsOverBackground) return
    shellCursorClass.value = dir === 'down' ? 'cursor-dn' : 'cursor-up'
    wheelCursorOverrideUntil = Date.now() + 450
    if (wheelCursorOverrideTimer) window.clearTimeout(wheelCursorOverrideTimer)
    wheelCursorOverrideTimer = window.setTimeout(() => {
      wheelCursorOverrideTimer = 0
      wheelCursorOverrideUntil = 0
      shellCursorClass.value =
        lastCursorClientY < window.innerHeight * 0.5 ? 'cursor-up' : 'cursor-dn'
    }, 480)
  }

  function onWindowWheelCursorHint(e) {
    if (!isEnabled()) return
    if (!isScrollTarget(e.target)) return
    const dy = Number(e.deltaY) || 0
    if (dy === 0) return
    setWheelCursorOverride(dy > 0 ? 'down' : 'up')
  }

  function rawGasDesiredVelocityPxPerSec(clientY) {
    const h = window.innerHeight
    if (h <= 0) return 0
    const half = h * 0.5
    const norm = Math.max(-1, Math.min(1, (clientY - half) / half))
    return norm * GAS_MAX_PX_PER_SEC
  }

  function gasPedalFrame(ts) {
    gasRafId = 0
    const lenis = getLenis()
    if (!lenis) return

    const dt =
      gasLastTs > 0 ? Math.min(0.055, Math.max(0.001, (ts - gasLastTs) / 1000)) : 1 / 60
    gasLastTs = ts

    const desired = gasPedalHeld.value
      ? rawGasDesiredVelocityPxPerSec(lastGasClientY)
      : 0
    const alpha = 1 - Math.exp(-GAS_VEL_LERP_PER_S * dt)
    gasVelPxPerSec += (desired - gasVelPxPerSec) * alpha

    const limit = lenis.limit
    const delta = gasVelPxPerSec * dt
    let newTarget = lenis.targetScroll + delta
    if (newTarget < 0 && gasVelPxPerSec < 0) {
      newTarget = 0
      gasVelPxPerSec = 0
    } else if (newTarget > limit && gasVelPxPerSec > 0) {
      newTarget = limit
      gasVelPxPerSec = 0
    }

    const { lerp, duration, easing } = lenis.options
    lenis.scrollTo(newTarget, {
      programmatic: false,
      lerp,
      duration,
      easing,
    })

    const coasting = Math.abs(gasVelPxPerSec) > 1.5
    if (gasPedalHeld.value || coasting) {
      gasRafId = requestAnimationFrame(gasPedalFrame)
    } else {
      gasVelPxPerSec = 0
      gasLastTs = 0
    }
  }

  function ensureGasPedalLoop() {
    if (!gasRafId) {
      gasLastTs = 0
      gasRafId = requestAnimationFrame(gasPedalFrame)
    }
  }

  function stopGasPedalLoop() {
    if (gasRafId) {
      cancelAnimationFrame(gasRafId)
      gasRafId = 0
    }
    gasLastTs = 0
    gasVelPxPerSec = 0
  }

  function updateShellCursor(e) {
    const t = e.target
    if (
      cursorClearSelector &&
      t instanceof Element &&
      t.closest(cursorClearSelector)
    ) {
      shellCursorClass.value = ''
      cursorIsOverBackground = false
      return
    }
    cursorIsOverBackground = isScrollTarget(t)
    lastCursorClientY = e.clientY
    if (!cursorIsOverBackground) {
      shellCursorClass.value = ''
      return
    }
    if (Date.now() < wheelCursorOverrideUntil) return
    shellCursorClass.value =
      e.clientY < window.innerHeight * 0.5 ? 'cursor-up' : 'cursor-dn'
  }

  function onGasPedalPointerMove(e) {
    if (!gasPedalHeld.value || e.pointerId !== gasPointerId) return
    lastGasClientY = e.clientY
    updateShellCursor(e)
  }

  function onGasPedalPointerUp(e) {
    if (e.pointerId !== gasPointerId) return
    gasPedalHeld.value = false
    gasPointerId = -1
    try {
      shellRef.value?.releasePointerCapture(e.pointerId)
    } catch (_) {
      /* noop */
    }
    window.removeEventListener('pointermove', onGasPedalPointerMove, true)
    window.removeEventListener('pointerup', onGasPedalPointerUp, true)
    window.removeEventListener('pointercancel', onGasPedalPointerUp, true)
    if (!gasRafId && Math.abs(gasVelPxPerSec) > 1.5) {
      ensureGasPedalLoop()
    }
  }

  function onShellPointerDown(e) {
    if (e.button !== 0 || e.pointerType !== 'mouse') return
    if (!isEnabled()) return
    if (!isScrollTarget(e.target)) return

    e.preventDefault()

    gasPointerId = e.pointerId
    lastGasClientY = e.clientY
    gasPedalHeld.value = true
    updateShellCursor(e)

    try {
      if (shellRef.value instanceof HTMLElement) {
        shellRef.value.setPointerCapture(e.pointerId)
      }
    } catch (_) {
      /* noop */
    }

    window.addEventListener('pointermove', onGasPedalPointerMove, true)
    window.addEventListener('pointerup', onGasPedalPointerUp, true)
    window.addEventListener('pointercancel', onGasPedalPointerUp, true)

    ensureGasPedalLoop()
  }

  function onShellPointerMove(e) {
    updateShellCursor(e)
  }

  function onShellPointerLeave() {
    if (!gasPedalHeld.value) shellCursorClass.value = ''
  }

  function teardown() {
    gasPedalHeld.value = false
    stopGasPedalLoop()
    shellCursorClass.value = ''
    window.removeEventListener('pointermove', onGasPedalPointerMove, true)
    window.removeEventListener('pointerup', onGasPedalPointerUp, true)
    window.removeEventListener('pointercancel', onGasPedalPointerUp, true)
    window.removeEventListener('wheel', onWindowWheelCursorHint)
    if (wheelCursorOverrideTimer) window.clearTimeout(wheelCursorOverrideTimer)
    wheelCursorOverrideTimer = 0
    wheelCursorOverrideUntil = 0
  }

  onMounted(() => {
    window.addEventListener('wheel', onWindowWheelCursorHint, { passive: true })
  })

  onBeforeUnmount(teardown)

  return {
    shellCursorClass,
    onShellPointerDown,
    onShellPointerMove,
    onShellPointerLeave,
    teardown,
  }
}
