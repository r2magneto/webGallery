/**
 * Statische Galerie: Layout-JSON und Bilderliste liegen unter `public/` und werden per URL geladen.
 * Unterstützte Layout-Dateien (Root von public/, z. B. `/layout.json`).
 */
import { imagesBasePathForLayoutConfig } from './config/galleryPaths.js'

const ALLOWED_LAYOUT_BASENAMES = new Set(['layout.json', 'layout2.json'])

function safeLayoutBasename(configFile) {
  const raw = String(configFile ?? '').trim()
  const name = raw.replace(/\\/g, '/').split('/').pop() || 'layout.json'
  return ALLOWED_LAYOUT_BASENAMES.has(name) ? name : 'layout.json'
}

/** Öffentlicher Pfad relativ zur Site-Root (Vite & jeder statische Host). */
export function layoutPublicUrl(configFile = 'layout.json') {
  const name = safeLayoutBasename(configFile)
  return `/${encodeURI(name)}`
}

/**
 * Lädt `{ items }` aus `public/<layout.json>`.
 * Bei Fehler oder ungültiger Antwort: [].
 */
export async function fetchGalleryLayoutItems(configFile = 'layout.json') {
  const url = layoutPublicUrl(configFile)
  let res
  try {
    res = await fetch(url)
  } catch {
    return []
  }

  if (!res.ok) return []

  let data
  try {
    data = await res.json()
  } catch {
    return []
  }

  if (!Array.isArray(data.items)) return []

  return data.items
}

/**
 * Liste der Bilddateinamen aus `public/<gallery>/manifest.json` (nebeneinander zur Galerie).
 * Schema: `{ "filenames": ["a.webp", …] }`. Bei fehlender Datei oder Fehler: [].
 */
export async function fetchManifestFilenames(configPath) {
  const base = imagesBasePathForLayoutConfig(configPath)
  const url = `${base}manifest.json`
  let res
  try {
    res = await fetch(url)
  } catch {
    return []
  }
  if (!res.ok) return []
  try {
    const data = await res.json()
    return Array.isArray(data.filenames) ? data.filenames : []
  } catch {
    return []
  }
}

/**
 * Speichern im rein statischen Betrieb: JSON-Datei herunterladen und manuell nach `public/` legen.
 */
export function downloadStaticLayoutJson(configPath, items) {
  const name = safeLayoutBasename(configPath)
  const payload = { items }
  const text = `${JSON.stringify(payload, null, 2)}\n`
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}
