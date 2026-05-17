const STORAGE_KEY = 'webGallery.refAboutColorConfig.v1'
const PROJECT_URL = `${import.meta.env.BASE_URL || '/'}ref-about-colors.json`

export {
  VGA_PALETTE,
  resolvePalette,
  defaultPalette,
} from './ansiPalette.js'

import { defaultColorConfigBase, normalizeColorConfig } from './ansiPalette.js'

export function defaultRefAboutColorConfig() {
  return defaultColorConfigBase()
}

export function loadRefAboutColorConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultRefAboutColorConfig()
    return normalizeColorConfig(JSON.parse(raw))
  } catch {
    return defaultRefAboutColorConfig()
  }
}

export function saveRefAboutColorConfig(cfg) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeColorConfig(cfg)))
}

function hasAnyPaint(cfg) {
  if (!cfg?.cells?.length) return false
  for (const row of cfg.cells) {
    if (!Array.isArray(row)) continue
    for (const c of row) {
      if (!c) continue
      if (c.fg != null || c.bg != null) return true
    }
  }
  return false
}

export async function loadProjectRefAboutColorConfig() {
  try {
    const res = await fetch(PROJECT_URL, { cache: 'no-cache' })
    if (!res.ok) return null
    const json = await res.json()
    return normalizeColorConfig(json)
  } catch {
    return null
  }
}

let ensureLoadedPromise = null

async function ensureProjectRefAboutDefaultsLoadedImpl() {
  const local = loadRefAboutColorConfig()
  if (hasAnyPaint(local)) return local
  const project = await loadProjectRefAboutColorConfig()
  if (project) {
    saveRefAboutColorConfig(project)
    return project
  }
  return local
}

/** Lädt ref-about-colors.json in localStorage, falls noch keine Farben gesetzt sind. */
export function ensureProjectRefAboutDefaultsLoaded() {
  if (!ensureLoadedPromise) {
    ensureLoadedPromise = ensureProjectRefAboutDefaultsLoadedImpl()
  }
  return ensureLoadedPromise
}

export function importRefAboutColorConfig(jsonLike) {
  return normalizeColorConfig(jsonLike)
}

export function downloadRefAboutColorConfig(cfg) {
  const blob = new Blob([`${JSON.stringify(normalizeColorConfig(cfg), null, 2)}\n`], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'ref-about-colors.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}
