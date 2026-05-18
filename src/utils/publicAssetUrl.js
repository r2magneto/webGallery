/**
 * Vite `base` (z. B. GitHub Pages unter `/webGallery/`).
 * Immer mit trailing slash.
 */
export function viteBase() {
  const b = import.meta.env.BASE_URL ?? '/'
  return b.endsWith('/') ? b : `${b}/`
}

/**
 * Öffentliche URL für eine Datei aus `public/` — gleicher Pfad wie unter `public/`.
 * @param {string} relativePath z. B. `layout.json`, `images/gallery1/bild.webp`
 */
export function publicAssetUrl(relativePath) {
  const trimmed = String(relativePath ?? '').replace(/^\/+/, '')
  return `${viteBase()}${trimmed}`
}

/** Verhindert Browser-Cache für statische JSON (gleicher Dateiname). */
export function cacheBustUrl(url) {
  const u = String(url ?? '')
  const sep = u.includes('?') ? '&' : '?'
  return `${u}${sep}t=${Date.now()}`
}
