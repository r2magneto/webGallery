/**
 * Custom-Cursor aus `public/assets/` — Pfade mit Vite BASE_URL (z. B. /webGallery/).
 * Wird vor App-Mount ausgeführt; Klassen in style.css nutzen die CSS-Variablen.
 */
function injectCustomCursorVars() {
  const base = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
  const stack = (file, fallback) =>
    `url('${base}assets/${file}') 16 16, ${fallback}`
  const r = document.documentElement.style
  r.setProperty('--cursor-up', stack('cur_up.png', 'n-resize'))
  r.setProperty('--cursor-dn', stack('cur_dn.png', 's-resize'))
  r.setProperty('--cursor-left', stack('cur_l.png', 'w-resize'))
  r.setProperty('--cursor-right', stack('cur_r.png', 'e-resize'))
  r.setProperty('--cursor-close', stack('cur_x.png', 'pointer'))
}

injectCustomCursorVars()
