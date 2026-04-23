<script setup>
import { computed, onMounted, ref } from 'vue'
import { VGA_PALETTE, loadHeaderColorConfig } from '../utils/headerColorConfig.js'

const ANSI_URL = `${import.meta.env.BASE_URL || '/'}Header_01_01_BW.utf8ans`

const props = defineProps({
  galleryTab: { type: String, required: true },
  isEditMode: { type: Boolean, required: true },
})

const emit = defineEmits(['select-gallery', 'enter-editor', 'exit-editor'])

function isActiveNav(tabKey) {
  return !props.isEditMode && props.galleryTab === tabKey
}

const rawHeaderText = ref('')
const headerLines = computed(() => buildHeaderLines(rawHeaderText.value))
const colorCfg = ref(null)

const activeKey = computed(() => (props.isEditMode ? null : props.galleryTab))

const CP437_TABLE = (() => {
  // 0x00-0x7F: ASCII; 0x80-0xFF: CP437 → Unicode.
  const hi =
    'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»' +
    '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌' +
    '█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '
  const t = new Array(256)
  for (let i = 0; i < 128; i += 1) t[i] = String.fromCharCode(i)
  for (let i = 0; i < 128; i += 1) t[128 + i] = hi[i] ?? '�'
  return t
})()

function decodeCp437(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) out += CP437_TABLE[bytes[i]]
  return out
}

function decodeBestEffort(bytes) {
  // Wunsch: UTF-8. Falls die Datei tatsächlich CP437-bytes enthält, würden sonst "�" entstehen.
  // In dem Fall fällt der Decoder auf CP437 zurück, damit Linien/Blockzeichen korrekt sind.
  try {
    const utf = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    if (utf.includes('�')) return decodeCp437(bytes)
    return utf
  } catch {
    return decodeCp437(bytes)
  }
}

function clsForSeg(seg) {
  const classes = ['ansi-seg']
  if (seg.bright) classes.push('ansi-bright')
  if (seg.hue) classes.push('ansi-hue')
  return classes.join(' ')
}

function styleForSeg(seg) {
  const st = {}
  if (seg.fgIdx != null) st.color = VGA_PALETTE[seg.fgIdx] ?? undefined
  if (seg.bgIdx != null) st.backgroundColor = VGA_PALETTE[seg.bgIdx] ?? undefined
  return st
}

function findBoxRange(lineText, labelText) {
  const labelIdx = lineText.indexOf(labelText)
  if (labelIdx < 0) return null
  const leftCornerCandidates = ['┌', '╔', '╒', '╓', '╭']
  const rightCornerCandidates = ['┐', '╗', '╕', '╖', '╮']
  let start = -1
  for (const c of leftCornerCandidates) {
    const s = lineText.lastIndexOf(c, labelIdx)
    if (s > start) start = s
  }
  let end = -1
  for (const c of rightCornerCandidates) {
    const e = lineText.indexOf(c, labelIdx)
    if (e !== -1 && (end === -1 || e < end)) end = e
  }
  if (start === -1 || end === -1) {
    // fallback: highlight a conservative range around the label
    start = Math.max(0, labelIdx - 3)
    end = Math.min(lineText.length - 1, labelIdx + labelText.length + 2)
  }
  return { start, end }
}

function findBoxColsFromLabelLine(lineText, labelText) {
  const labelIdx = lineText.indexOf(labelText)
  if (labelIdx < 0) return null
  // Prefer vertical borders on the label line.
  const leftBorder = Math.max(
    lineText.lastIndexOf('│', labelIdx),
    lineText.lastIndexOf('║', labelIdx),
  )
  const rightSearchStart = labelIdx + labelText.length
  const rightCandidates = []
  const r1 = lineText.indexOf('│', rightSearchStart)
  if (r1 !== -1) rightCandidates.push(r1)
  const r2 = lineText.indexOf('║', rightSearchStart)
  if (r2 !== -1) rightCandidates.push(r2)
  const rightBorder =
    rightCandidates.length > 0 ? Math.min(...rightCandidates) : -1

  if (leftBorder !== -1 && rightBorder !== -1 && rightBorder > leftBorder) {
    return { start: leftBorder, end: rightBorder }
  }
  return findBoxRange(lineText, labelText)
}

function swapSingleToDouble(s) {
  return s
    .replaceAll('┌', '╔')
    .replaceAll('┐', '╗')
    .replaceAll('└', '╚')
    .replaceAll('┘', '╝')
    .replaceAll('├', '╠')
    .replaceAll('┤', '╣')
    .replaceAll('┬', '╦')
    .replaceAll('┴', '╩')
    .replaceAll('┼', '╬')
    .replaceAll('│', '║')
    .replaceAll('─', '═')
}

function swapDoubleToSingle(s) {
  return s
    .replaceAll('╔', '┌')
    .replaceAll('╗', '┐')
    .replaceAll('╚', '└')
    .replaceAll('╝', '┘')
    .replaceAll('╠', '├')
    .replaceAll('╣', '┤')
    .replaceAll('╦', '┬')
    .replaceAll('╩', '┴')
    .replaceAll('╬', '┼')
    .replaceAll('║', '│')
    .replaceAll('═', '─')
}

const BOX_CHARS = new Set(
  '┌┐└┘├┤┬┴┼─│╔╗╚╝╠╣╦╩╬═║'.split(''),
)

function segLineFromCharStyles(chars, styles) {
  const segs = []
  let cur = null
  for (let i = 0; i < chars.length; i += 1) {
    const st = styles[i] || {}
    const key = `${st.fgIdx ?? ''}|${st.bgIdx ?? ''}|${st.hue ? 1 : 0}|${
      st.bright ? 1 : 0
    }|${st.btnKey || ''}`
    if (!cur || cur._key !== key) {
      cur = {
        _key: key,
        text: chars[i],
        fgIdx: st.fgIdx ?? null,
        bgIdx: st.bgIdx ?? null,
        hue: Boolean(st.hue),
        bright: Boolean(st.bright),
        btnKey: st.btnKey ?? null,
      }
      segs.push(cur)
    } else {
      cur.text += chars[i]
    }
  }
  for (const s of segs) delete s._key
  return { segments: segs }
}

function applyActiveBoxSwap(lines) {
  const targets = [
    { key: 'g1', label: 'MOTION CAPTURE' },
    { key: 'g2', label: '360 VIDEO CAPTURE' },
    { key: 'list', label: 'REFERENCES / ABOUT' },
  ]
  const aKey = activeKey.value
  if (!aKey) return { lines, activeRanges: [] }

  const out = [...lines]
  const ranges = []

  for (const t of targets) {
    const idx = lines.findIndex((ln) => ln.includes(t.label))
    if (idx === -1) continue
    const r = findBoxColsFromLabelLine(lines[idx], t.label)
    if (!r) continue
    ranges.push({ key: t.key, line: idx, start: r.start, end: r.end })

    // Buttons are 4 lines high: top border, inner empty line, label line, bottom border.
    // The label line is `idx`, so cover idx-2..idx+1.
    for (const j of [idx - 2, idx - 1, idx, idx + 1]) {
      if (j < 0 || j >= out.length) continue
      const original = out[j]
      const mid = original.slice(r.start, r.end + 1)
      const swapped = t.key === aKey ? swapSingleToDouble(mid) : swapDoubleToSingle(mid)
      out[j] = original.slice(0, r.start) + swapped + original.slice(r.end + 1)
    }
  }

  const active = ranges.find((x) => x.key === aKey)
  return active
    ? { lines: out, activeRanges: [active] }
    : { lines: out, activeRanges: [] }
}

function buildHeaderLines(text) {
  const clean = String(text || '').replace(/\r\n/g, '\n')
  const baseLines = clean.split('\n')
  const { lines, activeRanges } = applyActiveBoxSwap(baseLines)
  const cfg = colorCfg.value

  const out = []
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li]
    const chars = [...line]
    const styles = chars.map(() => ({
      fgIdx: null,
      bgIdx: null,
      hue: false,
      bright: false,
      btnKey: null,
    }))

    const isRedNote =
      line.includes('PLEASE NOTE') ||
      line.includes('Working On New Projects') ||
      line.includes('Do Not Offer') ||
      line.includes('Serivce') ||
      (line.includes('ͻ') && line.includes('ͼ'))

    const isWelcome = line.includes('Be Welcome To Browse Impressions Of Earlier Works And Projects')
    const isMalte = line.includes('MALTE MAAS')
    const isCaptureStudio = line.includes('CAPTURE STUDIO')

    const navTargets = [
      { key: 'g1', label: 'MOTION CAPTURE' },
      { key: 'g2', label: '360 VIDEO CAPTURE' },
      { key: 'list', label: 'REFERENCES / ABOUT' },
    ]

    // Default look: dim gray for visible glyphs (monochrome, should NOT hue-cycle)
    for (let i = 0; i < chars.length; i += 1) {
      if (chars[i] !== ' ' && styles[i].fgIdx == null) styles[i].fgIdx = 8
    }

    // Base colors: approximate from Header_01_01.png
    if (isRedNote) {
      for (let i = 0; i < chars.length; i += 1) {
        styles[i].fgIdx = 12
        styles[i].hue = Boolean(cfg?.cycle?.[12])
        styles[i].bright = true
      }
    } else if (isWelcome) {
      for (let i = 0; i < chars.length; i += 1) {
        styles[i].bgIdx = 5
        styles[i].fgIdx = 0 // black text
        styles[i].hue = Boolean(cfg?.cycle?.[5])
      }
      // small yellow “caps” like in the PNG
      for (const i of [0, 1, chars.length - 2, chars.length - 1]) {
        if (i >= 0 && i < chars.length && chars[i] === ' ') {
          styles[i].fgIdx = 14
          styles[i].hue = Boolean(cfg?.cycle?.[14])
        }
      }
    } else if (isMalte) {
      const start = line.indexOf('MALTE MAAS')
      if (start >= 0) {
        for (let i = start; i < start + 'MALTE MAAS'.length; i += 1) {
          styles[i].fgIdx = 13
          styles[i].hue = Boolean(cfg?.cycle?.[13])
          styles[i].bright = true
          styles[i].btnKey = '__enter_editor__'
        }
      }
    } else if (isCaptureStudio) {
      // yellow frame-ish + white text in the middle
      for (let i = 0; i < chars.length; i += 1) {
        if (BOX_CHARS.has(chars[i])) {
          styles[i].fgIdx = 14
          styles[i].hue = Boolean(cfg?.cycle?.[14])
          styles[i].bright = true
        }
      }
      const start = line.indexOf('CAPTURE STUDIO')
      if (start >= 0) {
        for (let i = start; i < start + 'CAPTURE STUDIO'.length; i += 1) {
          styles[i].fgIdx = 15
          styles[i].bright = true
        }
      }
    }

    // Navigation boxes: border yellow, labels magenta (clickable)
    for (const nt of navTargets) {
      const idx = line.indexOf(nt.label)
      if (idx >= 0) {
        const range = findBoxRange(line, nt.label)
        if (range) {
          for (let i = range.start; i <= range.end; i += 1) {
            if (BOX_CHARS.has(chars[i]) || chars[i] === ' ') {
              styles[i].fgIdx = 14
              styles[i].hue = Boolean(cfg?.cycle?.[14])
              styles[i].bright = true
            }
          }
          for (let i = idx; i < idx + nt.label.length; i += 1) {
            const isActive = activeKey.value === nt.key
            styles[i].fgIdx = isActive ? 15 : 13
            styles[i].hue = isActive ? false : Boolean(cfg?.cycle?.[13])
            styles[i].bright = true
            styles[i].btnKey = nt.key
          }
          // extra glow for active tab content (after swap)
          if (activeKey.value === nt.key) {
            for (let i = range.start; i <= range.end; i += 1) {
              styles[i].bright = true
            }
          }
        }
      }
    }

    // Logo + lila Zierlinien (approx, closer to PNG):
    // - Gelb: zentraler Schriftzug-Blockbereich
    // - Lila: horizontale Bars + seitliche "Frames"
    if (li >= 1 && li <= 14 && !isRedNote && !isWelcome) {
      for (let i = 0; i < chars.length; i += 1) {
        const c = chars[i]
        const isBlock = '█▓▒░▀▄▌▐■'.includes(c) || c === '�'
        const inLogoBand = i >= 22 && i <= 72
        const inSideBars = (i >= 5 && i <= 18) || (i >= 76 && i <= 95)

        if (isBlock && inLogoBand) {
          styles[i].fgIdx = 14
          styles[i].hue = Boolean(cfg?.cycle?.[14])
          styles[i].bright = true
        }

        // Purple accent lines/bars (use magenta fg) – mainly outside logo band.
        if ((c === '─' || c === '═') || (isBlock && inSideBars && li >= 3 && li <= 12)) {
          styles[i].fgIdx = 13
          styles[i].hue = Boolean(cfg?.cycle?.[13])
          styles[i].bright = true
        }
      }
    }

    // Apply user-painted overrides (per cell).
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
          // hue stays true if either fg or bg participates
          styles[i].hue = styles[i].hue || Boolean(cfg.cycle?.[cell.bg])
        }
      }
    }

    // Apply active range extra glow (if we have it)
    for (const ar of activeRanges) {
      if (ar.line !== li) continue
      for (let i = ar.start; i <= ar.end && i < styles.length; i += 1) {
        styles[i].bright = true
      }
    }

    out.push(segLineFromCharStyles(chars, styles))
  }
  return out
}

onMounted(async () => {
  try {
    colorCfg.value = loadHeaderColorConfig()
    window.addEventListener('storage', () => {
      colorCfg.value = loadHeaderColorConfig()
    })
    const res = await fetch(ANSI_URL)
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    rawHeaderText.value = decodeBestEffort(bytes)
  } catch {
    rawHeaderText.value = 'HEADER LOAD FAILED'
  }
})
</script>

<template>
  <header class="ansi-header-root" aria-label="Seitenkopf">
    <div class="ansi-header-scanlines" aria-hidden="true" />
    <div class="ansi-header-wrap">
      <div class="ansi-header-canvas">
        <pre class="ansi-pre" aria-label="Navigation (ANSI)">
<template v-for="(ln, li) in headerLines" :key="li"><span
  v-for="(seg, si) in ln.segments"
  :key="`${li}-${si}`"
  :class="clsForSeg(seg)"
  :style="styleForSeg(seg)"
><button
  v-if="seg.btnKey"
  type="button"
  class="ansi-btn"
  :class="seg.btnKey !== '__enter_editor__' && isActiveNav(seg.btnKey) ? 'ansi-btn--active' : ''"
  @click="seg.btnKey === '__enter_editor__' ? emit('enter-editor') : emit('select-gallery', seg.btnKey)"
>{{ seg.text }}</button><template v-else>{{ seg.text }}</template></span><span class="ansi-nl">
</span></template>
        </pre>
      </div>
    </div>
  </header>
</template>

<style scoped>
.ansi-header-root {
  position: relative;
  z-index: 40;
}

.ansi-header-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: clamp(10px, 2.2vw, 20px) clamp(8px, 1.6vw, 14px)
    clamp(8px, 1.4vw, 14px);
  transform: translateZ(0);
}

.ansi-header-canvas {
  background: transparent;
  width: 100%;
  max-width: 100vw;
  display: flex;
  justify-content: center;
  overflow: hidden;
  /* Ziel: ~120% Standard, reagiert spürbar auf Fensterbreite */
  --ansi-scale: clamp(1, calc(0.85 + 0.00035 * 100vw), 1.35);
  transform: scale(var(--ansi-scale));
  transform-origin: top center;
}

.ansi-header-scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    rgb(0 0 0 / 0) 0px,
    rgb(0 0 0 / 0) 2px,
    rgb(0 0 0 / 0.12) 2px,
    rgb(0 0 0 / 0.12) 3px
  );
  opacity: 0.32;
}

.ansi-pre {
  margin: 0;
  white-space: pre;
  font-family: 'Web437 IBM VGA 9x16', 'Web437 IBM VGA 8x14 2x',
    'Web437 IBM VGA 8x14', ui-monospace, monospace;
  /* reacts to window width */
  font-size: clamp(11px, 1.7vw, 22px);
  /* unitless: scales with font-size; slight overlap to hide hairlines */
  line-height: 0.99;
  letter-spacing: -0.5px;
  color: #e5e7eb;
  text-shadow: 0 0 10px rgb(250 204 21 / 0.16);
  background-color: transparent;
  text-rendering: optimizeLegibility;
  shape-rendering: crispEdges;
  -webkit-font-smoothing: subpixel-antialiased;
  -moz-osx-font-smoothing: auto;
}

.ansi-pre::selection,
.ansi-pre *::selection {
  background-color: #ffd200 !important;
  color: black !important;
}

.ansi-seg {
  display: inline;
}

.ansi-nl {
  display: block;
  height: 0;
}

.ansi-fg-yellow {
  color: #facc15;
  text-shadow:
    0 0 12px rgb(250 204 21 / 0.22),
    0 0 1px rgb(250 204 21 / 0.75);
}

.ansi-fg-white {
  color: #ffffff;
  text-shadow: 0 0 10px rgb(255 255 255 / 0.16);
}

.ansi-fg-magenta {
  color: #ff00ff;
  text-shadow: 0 0 14px rgb(255 0 255 / 0.18);
}

.ansi-fg-red {
  color: #ff2a2a;
  text-shadow: 0 0 12px rgb(255 42 42 / 0.22);
}

.ansi-fg-dim {
  color: #6b7280;
  text-shadow: none;
}

.ansi-bg-magenta {
  background: #8b00ff;
}

.ansi-bg-black {
  background: #000;
}

.ansi-bright {
  filter: brightness(1.08);
}

.ansi-hue {
  display: inline;
  animation: hueCycle 20s linear infinite;
  will-change: filter;
}

.ansi-btn {
  all: unset;
  display: inline;
  cursor: pointer;
}

.ansi-btn:focus-visible {
  outline: 2px solid rgb(250 204 21 / 0.85);
  outline-offset: 2px;
}

.ansi-btn--active {
  filter: brightness(1.22) saturate(1.1);
}
</style>
