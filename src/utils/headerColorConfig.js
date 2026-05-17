const STORAGE_KEY = 'webGallery.headerColorConfig.v1'
const PROJECT_URL = `${import.meta.env.BASE_URL || '/'}header-colors.json`

export {
  VGA_PALETTE,
  VGA_PALETTE_BASE,
  PALETTE_SIZE,
  defaultPalette,
  resolvePalette,
  defaultCycleFlags,
  normalizePalette,
  normalizeCycle,
} from './ansiPalette.js'

import { defaultColorConfigBase, normalizeColorConfig } from './ansiPalette.js'

export function defaultHeaderColorConfig() {
  return defaultColorConfigBase()
}

export function loadHeaderColorConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultHeaderColorConfig()
    return normalizeColorConfig(JSON.parse(raw))
  } catch {
    return defaultHeaderColorConfig()
  }
}

export function saveHeaderColorConfig(cfg) {
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

export async function loadProjectHeaderColorConfig() {
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

async function ensureProjectHeaderDefaultsLoadedImpl() {
  const local = loadHeaderColorConfig()
  if (hasAnyPaint(local)) return local
  const project = await loadProjectHeaderColorConfig()
  if (project) {
    saveHeaderColorConfig(project)
    return project
  }
  return local
}

/** Lädt header-colors.json in localStorage, falls noch keine Farben gesetzt sind. */
export function ensureProjectHeaderDefaultsLoaded() {
  if (!ensureLoadedPromise) {
    ensureLoadedPromise = ensureProjectHeaderDefaultsLoadedImpl()
  }
  return ensureLoadedPromise
}

export function importHeaderColorConfig(jsonLike) {
  return normalizeColorConfig(jsonLike)
}

export function downloadHeaderColorConfig(cfg) {
  const blob = new Blob([`${JSON.stringify(normalizeColorConfig(cfg), null, 2)}\n`], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'header-colors.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}
