import { publicAssetUrl } from '../utils/publicAssetUrl.js'

/**
 * Zentrale „Schubladen“-Logik: welche layout.json gehört zu welchem Bilder-Unterordner.
 *
 * ─── Gallery 03+ hinzufügen ─────────────────────────────────────────────
 * 1. Hier Eintrag: 'layout3.json': { imagesBasePath: 'images/gallery3/' } (relativ zu public/)
 * 2. apiConfig.js: ALLOWED_LAYOUT_BASENAMES ergänzen (und ggf. App.vue Tabs)
 * 3. App.vue: CONFIG_G3, Tab, scrollByConfig, GalleryModule/Editor-Verdrahtung
 * 4. public/layout3.json + public/images/gallery3/manifest.json anlegen
 * 5. public/images/gallery3/ für Bilddateien
 */

/**
 * Schlüssel = Dateiname unter public/ (z. B. layout.json).
 * `imagesBasePath` = Pfad unter public/ (ohne führenden Slash); die echte URL nutzt import.meta.env.BASE_URL.
 */
export const GALLERY_PATHS_BY_LAYOUT_FILE = {
  'layout.json': {
    imagesBasePath: 'images/gallery1/',
  },
  'layout2.json': {
    imagesBasePath: 'images/gallery2/',
  },
}

const DEFAULT_LAYOUT = 'layout.json'

/**
 * Basis-URL für Bilder dieser Galerie (mit trailing slash), inkl. Vite-Basis z. B. /webGallery/.
 */
export function imagesBasePathForLayoutConfig(configPath) {
  const key =
    typeof configPath === 'string' && configPath.trim()
      ? configPath.trim()
      : DEFAULT_LAYOUT
  const entry = GALLERY_PATHS_BY_LAYOUT_FILE[key]
  const rel = entry?.imagesBasePath
    ? entry.imagesBasePath
    : GALLERY_PATHS_BY_LAYOUT_FILE[DEFAULT_LAYOUT].imagesBasePath
  return publicAssetUrl(rel)
}

/**
 * Setzt den Galerie-Basis-Pfad vor den Dateinamen aus der JSON (unabhängig von altem /images/-Pfad).
 */
export function resolveGalleryImageSrc(rawSrc, configPath) {
  const base = imagesBasePathForLayoutConfig(configPath)
  if (rawSrc == null || rawSrc === '') return ''
  const s = String(rawSrc).trim()
  if (s.startsWith(base)) return s
  const withoutQuery = s.split('?')[0]
  const segments = withoutQuery.split('/').filter(Boolean)
  const fileName = segments.length ? segments[segments.length - 1] : s
  if (!fileName) return base
  return `${base}${fileName}`
}
