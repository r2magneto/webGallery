/** Keep trailing spaces (full-line background paint); drop trailing newlines only. */
export function normalizePlainAnsiText(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\n+$/, '')
}

/** Center each line in `width` character cells so background paint can span the full row. */
export function centerPadPlainLines(text, width) {
  const clean = normalizePlainAnsiText(text)
  const w = Number(width) || 0
  if (w < 1) return clean
  return clean
    .split('\n')
    .map((line) => {
      const core = line.trim()
      if (core.length >= w) return core
      const pad = w - core.length
      const left = Math.floor(pad / 2)
      return `${' '.repeat(left)}${core}${' '.repeat(pad - left)}`
    })
    .join('\n')
}

export function segLineFromCharStyles(chars, styles) {
  const segs = []
  let cur = null
  for (let i = 0; i < chars.length; i += 1) {
    const st = styles[i] || {}
    const key = `${st.fgIdx ?? ''}|${st.bgIdx ?? ''}|${st.hue ? 1 : 0}|${st.bright ? 1 : 0}`
    if (!cur || cur._key !== key) {
      cur = {
        _key: key,
        text: chars[i],
        fgIdx: st.fgIdx ?? null,
        bgIdx: st.bgIdx ?? null,
        hue: Boolean(st.hue),
        bright: Boolean(st.bright),
      }
      segs.push(cur)
    } else {
      cur.text += chars[i]
    }
  }
  for (const s of segs) delete s._key
  return { segments: segs }
}

/** Monochrome default + per-cell paint from color config (same model as header). */
export function buildPlainAnsiLines(text, cfg, options = {}) {
  const defaultFgIdx = options.defaultFgIdx ?? 8
  const maxLines = options.maxLines ?? null
  const clean = normalizePlainAnsiText(text)
  const baseLines = clean.split('\n')
  while (baseLines.length > 0 && baseLines[baseLines.length - 1] === '') {
    baseLines.pop()
  }
  const out = []

  for (let li = 0; li < baseLines.length; li += 1) {
    const line = baseLines[li]
    const chars = [...line]
    const styles = chars.map(() => ({
      fgIdx: null,
      bgIdx: null,
      hue: false,
      bright: false,
    }))

    for (let i = 0; i < chars.length; i += 1) {
      if (chars[i] !== ' ' && styles[i].fgIdx == null) styles[i].fgIdx = defaultFgIdx
    }

    if (cfg?.cells?.[li]) {
      const row = cfg.cells[li]
      for (let i = 0; i < chars.length && i < row.length; i += 1) {
        const cell = row[i]
        if (!cell) continue
        if (cell.fg != null) {
          styles[i].fgIdx = cell.fg
          styles[i].hue = Boolean(cfg.cycle?.[cell.fg])
        }
        if (cell.bg != null) {
          styles[i].bgIdx = cell.bg
          styles[i].hue = styles[i].hue || Boolean(cfg.cycle?.[cell.bg])
        }
      }
    }

    out.push(segLineFromCharStyles(chars, styles))
  }

  if (maxLines != null && maxLines > 0) {
    return out.slice(0, maxLines)
  }
  return out
}
