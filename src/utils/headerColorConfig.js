const STORAGE_KEY = 'webGallery.headerColorConfig.v1'
const PROJECT_URL = `${import.meta.env.BASE_URL || '/'}header-colors.json`

export const VGA_PALETTE = [
  '#000000', // 0 black
  '#0000AA', // 1 blue
  '#00AA00', // 2 green
  '#00AAAA', // 3 cyan
  '#AA0000', // 4 red
  '#AA00AA', // 5 magenta
  '#AA5500', // 6 brown
  '#AAAAAA', // 7 light gray
  '#555555', // 8 dark gray
  '#5555FF', // 9 light blue
  '#55FF55', // 10 light green
  '#55FFFF', // 11 light cyan
  '#FF5555', // 12 light red
  '#FF55FF', // 13 light magenta
  '#FFFF55', // 14 yellow
  '#FFFFFF', // 15 white
]

export function defaultHeaderColorConfig() {
  return {
    version: 1,
    // Per cell: { fg: 0-15|null, bg: 0-15|null }
    // Stored as array of lines; each line is array of {fg,bg} or null.
    cells: [],
    // For each palette index: should hueCycle apply?
    cycle: Array.from({ length: 16 }, (_, i) =>
      // by default: only colorful indices participate, gray/black/white stay static
      ![0, 7, 8, 15].includes(i),
    ),
  }
}

export function loadHeaderColorConfig() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultHeaderColorConfig()
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== 1) return defaultHeaderColorConfig()
    if (!Array.isArray(parsed.cycle) || parsed.cycle.length !== 16) {
      parsed.cycle = defaultHeaderColorConfig().cycle
    }
    if (!Array.isArray(parsed.cells)) parsed.cells = []
    return parsed
  } catch {
    return defaultHeaderColorConfig()
  }
}

export function saveHeaderColorConfig(cfg) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

function normalizeConfig(cfg) {
  const base = defaultHeaderColorConfig()
  if (!cfg || cfg.version !== 1) return base
  const out = { ...base, ...cfg }
  if (!Array.isArray(out.cells)) out.cells = []
  if (!Array.isArray(out.cycle) || out.cycle.length !== 16) out.cycle = base.cycle
  return out
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
    return normalizeConfig(json)
  } catch {
    return null
  }
}

/**
 * Projektweiter Default-Import:
 * - Wenn LocalStorage leer oder ohne Paint ist, wird `public/header-colors.json` als Basis übernommen.
 * - Wenn LocalStorage bereits Paint enthält, bleibt es unangetastet (User überschreibt Projektdefault).
 */
export async function ensureProjectHeaderDefaultsLoaded() {
  const local = loadHeaderColorConfig()
  if (hasAnyPaint(local)) return local
  const project = await loadProjectHeaderColorConfig()
  if (project) {
    saveHeaderColorConfig(project)
    return project
  }
  return local
}

export function importHeaderColorConfig(jsonLike) {
  return normalizeConfig(jsonLike)
}

export function downloadHeaderColorConfig(cfg) {
  const blob = new Blob([`${JSON.stringify(cfg, null, 2)}\n`], {
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

