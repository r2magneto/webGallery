export const PALETTE_SIZE = 32
export const ROW_SIZE = 16

export const VGA_PALETTE_BASE = [
  '#000000',
  '#0000AA',
  '#00AA00',
  '#00AAAA',
  '#AA0000',
  '#AA00AA',
  '#AA5500',
  '#AAAAAA',
  '#555555',
  '#5555FF',
  '#55FF55',
  '#55FFFF',
  '#FF5555',
  '#FF55FF',
  '#FFFF55',
  '#FFFFFF',
]

export function halveHexColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return '#000000'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const toHex = (v) => Math.round(v).toString(16).padStart(2, '0')
  return `#${toHex(r / 2)}${toHex(g / 2)}${toHex(b / 2)}`
}

export function defaultPalette() {
  return [...VGA_PALETTE_BASE, ...VGA_PALETTE_BASE.map(halveHexColor)]
}

export function defaultCycleFlags() {
  const row = Array.from({ length: ROW_SIZE }, (_, i) => ![0, 7, 8, 15].includes(i))
  return [...row, ...row]
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return { r: 0, g: 0, b: 0 }
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)))
  const toHex = (v) => clamp(v).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function normalizePalette(palette) {
  const def = defaultPalette()
  if (!Array.isArray(palette)) return [...def]
  const out = [...def]
  for (let i = 0; i < PALETTE_SIZE; i += 1) {
    const c = palette[i]
    if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) out[i] = c
  }
  return out
}

export function normalizeCycle(cycle) {
  const def = defaultCycleFlags()
  if (!Array.isArray(cycle)) return [...def]
  const out = [...def]
  for (let i = 0; i < PALETTE_SIZE; i += 1) {
    if (typeof cycle[i] === 'boolean') out[i] = cycle[i]
  }
  if (cycle.length === ROW_SIZE) {
    for (let i = 0; i < ROW_SIZE; i += 1) out[ROW_SIZE + i] = out[i]
  }
  return out
}

export function resolvePalette(cfg) {
  return normalizePalette(cfg?.palette)
}

/** @deprecated Use defaultPalette() or resolvePalette(cfg) */
export const VGA_PALETTE = defaultPalette()

export function defaultColorConfigBase() {
  return {
    version: 1,
    cells: [],
    palette: defaultPalette(),
    cycle: defaultCycleFlags(),
  }
}

export function normalizeColorConfig(cfg) {
  const base = defaultColorConfigBase()
  if (!cfg || cfg.version !== 1) return base
  return {
    version: 1,
    cells: Array.isArray(cfg.cells) ? cfg.cells : [],
    palette: normalizePalette(cfg.palette),
    cycle: normalizeCycle(cfg.cycle),
  }
}
