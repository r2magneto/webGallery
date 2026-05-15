/**
 * Entprellter ResizeObserver für die Grid-Host-Breite (kein Pixel-für-Pixel-Reflow).
 */
export function createGridHostWidthObserver({
  onWidthChange,
  debounceMs = 50,
  minDeltaPx = 1,
} = {}) {
  let observer = null
  let rafId = 0
  let timerId = 0
  let pendingW = 0
  let lastApplied = 0

  function applyPending() {
    rafId = 0
    timerId = 0
    const w = Math.round(pendingW)
    if (w <= 0) return
    if (Math.abs(w - lastApplied) < minDeltaPx) return
    lastApplied = w
    onWidthChange?.(w)
  }

  function schedule(w) {
    pendingW = w
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      rafId = 0
      if (timerId) clearTimeout(timerId)
      timerId = window.setTimeout(applyPending, debounceMs)
    })
  }

  function bind(el, initialWidth) {
    disconnect()
    if (!el) return
    const startW =
      initialWidth != null && initialWidth > 0
        ? Math.round(initialWidth)
        : Math.round(el.offsetWidth)
    if (startW > 0) {
      lastApplied = startW
      onWidthChange?.(startW)
    }
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width
      if (w != null && w > 0) schedule(w)
    })
    observer.observe(el)
  }

  function disconnect() {
    observer?.disconnect()
    observer = null
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (timerId) {
      clearTimeout(timerId)
      timerId = 0
    }
  }

  return { bind, disconnect }
}
