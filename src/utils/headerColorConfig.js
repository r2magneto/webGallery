import { cacheBustUrl, publicAssetUrl } from './publicAssetUrl.js'

const STORAGE_KEY = 'webGallery.headerColorConfig.v1'
const ASSET_STORAGE_PREFIX = 'webGallery.headerAssetColor.v1.'
const PROJECT_URL = publicAssetUrl('header-colors.json')

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

function assetStorageKey(assetFileName) {
  return `${ASSET_STORAGE_PREFIX}${assetFileName}`
}

export function loadAssetColorConfigFromStorage(assetFileName) {
  try {
    const raw = window.localStorage.getItem(assetStorageKey(assetFileName))
    if (!raw) return defaultHeaderColorConfig()
    return normalizeColorConfig(JSON.parse(raw))
  } catch {
    return defaultHeaderColorConfig()
  }
}

export function saveAssetColorConfig(assetFileName, cfg) {
  window.localStorage.setItem(
    assetStorageKey(assetFileName),
    JSON.stringify(normalizeColorConfig(cfg)),
  )
}

export async function loadProjectAssetColorConfig(assetFileName) {
  return loadAssetColorConfig(assetFileName)
}

/** Editor-Entwurf in localStorage, sonst `_col.json` / `header-colors.json`. */
export async function loadDisplayAssetColorConfig(assetFileName) {
  const local = loadAssetColorConfigFromStorage(assetFileName)
  if (hasAnyPaint(local)) return local
  return loadAssetColorConfig(assetFileName)
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
    const res = await fetch(cacheBustUrl(PROJECT_URL))
    if (!res.ok) return null
    const json = await res.json()
    return normalizeColorConfig(json)
  } catch {
    return null
  }
}

export async function loadPublicHeaderColorConfig(relativePath) {
  try {
    const res = await fetch(cacheBustUrl(publicAssetUrl(relativePath)))
    if (!res.ok) return null
    const json = await res.json()
    return normalizeColorConfig(json)
  } catch {
    return null
  }
}

/** z. B. `header_01_01_BW.txt` → `header_01_01_col.json`, `btn_mocap.txt` → `btn_mocap_col.json` */
export function assetColorJsonNameFor(assetFileName) {
  const name = String(assetFileName ?? '')
  if (/_bw\.txt$/i.test(name)) return name.replace(/_bw\.txt$/i, '_col.json')
  if (/\.txt$/i.test(name)) return name.replace(/\.txt$/i, '_col.json')
  if (/_bw\.utf8ans$/i.test(name)) return name.replace(/_bw\.utf8ans$/i, '_col.json')
  return `${name.replace(/\.[^.]+$/, '')}_col.json`
}

/** @deprecated Use assetColorJsonNameFor */
export function headerColorJsonNameFor(headerFileName) {
  return assetColorJsonNameFor(headerFileName)
}

export async function loadAssetColorConfig(assetFileName) {
  const specific = await loadPublicHeaderColorConfig(assetColorJsonNameFor(assetFileName))
  if (specific) return specific
  const fallback = await loadProjectHeaderColorConfig()
  if (fallback) return fallback
  return defaultHeaderColorConfig()
}

/** Header-spezifische `_col.json`, sonst globale `header-colors.json`. */
export async function loadHeaderColorConfigForHeader(headerFileName) {
  return loadAssetColorConfig(headerFileName)
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

export function downloadAssetColorConfig(assetFileName, cfg) {
  const blob = new Blob([`${JSON.stringify(normalizeColorConfig(cfg), null, 2)}\n`], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = assetColorJsonNameFor(assetFileName)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}
