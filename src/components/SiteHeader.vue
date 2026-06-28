<script setup>
import { computed, onMounted, ref } from 'vue'
import { buildPlainAnsiLines } from '../utils/ansiPlainRender.js'
import {
  defaultHeaderColorConfig,
  loadDisplayAssetColorConfig,
  resolvePalette,
} from '../utils/headerColorConfig.js'

const AVAILABLE_HEADERS = ['header_01_01_BW.txt', 'header_02_01_BW.txt']

const NOTEBOX_FILE = 'notebox.txt'
const BUTTONTITLE_FILE = 'buttontitle.txt'

const EDITOR_LINK_TEXT = 'MALTE MAAS'

const NAV_BUTTONS = [
  { key: 'g1', file: 'btn_mocap.txt', label: 'MOTION CAPTURE' },
  { key: 'g2', file: 'btn_360cap.txt', label: '360 VIDEO CAPTURE' },
  { key: 'list', file: 'btn_reference.txt', label: 'REFERENCES / ABOUT' },
]

const currentHeaderFile = ref(AVAILABLE_HEADERS[0])

const props = defineProps({
  galleryTab: { type: String, required: true },
  isEditMode: { type: Boolean, required: true },
})

const emit = defineEmits(['select-gallery', 'enter-editor', 'exit-editor'])

function isActiveNav(tabKey) {
  return !props.isEditMode && props.galleryTab === tabKey
}

const rawHeaderText = ref('')
const rawNoteboxText = ref('')
const rawButtontitleText = ref('')
const rawBtnMocapText = ref('')
const rawBtn360capText = ref('')
const rawBtnReferenceText = ref('')

const headerColorCfg = ref(defaultHeaderColorConfig())
const noteboxColorCfg = ref(defaultHeaderColorConfig())
const buttontitleColorCfg = ref(defaultHeaderColorConfig())
const btnMocapColorCfg = ref(defaultHeaderColorConfig())
const btn360capColorCfg = ref(defaultHeaderColorConfig())
const btnReferenceColorCfg = ref(defaultHeaderColorConfig())

const headerPalette = computed(() => resolvePalette(headerColorCfg.value))
const noteboxPalette = computed(() => resolvePalette(noteboxColorCfg.value))
const buttontitlePalette = computed(() => resolvePalette(buttontitleColorCfg.value))

const headerLines = computed(() =>
  buildPlainAnsiLines(rawHeaderText.value, headerColorCfg.value),
)
const noteboxLines = computed(() =>
  buildPlainAnsiLines(rawNoteboxText.value, noteboxColorCfg.value),
)
const buttontitleLines = computed(() =>
  buildPlainAnsiLines(rawButtontitleText.value, buttontitleColorCfg.value),
)

const buttonMeta = {
  g1: { text: rawBtnMocapText, color: btnMocapColorCfg, palette: computed(() => resolvePalette(btnMocapColorCfg.value)) },
  g2: { text: rawBtn360capText, color: btn360capColorCfg, palette: computed(() => resolvePalette(btn360capColorCfg.value)) },
  list: { text: rawBtnReferenceText, color: btnReferenceColorCfg, palette: computed(() => resolvePalette(btnReferenceColorCfg.value)) },
}

const buttonLines = computed(() => {
  const out = {}
  for (const btn of NAV_BUTTONS) {
    const meta = buttonMeta[btn.key]
    const raw = meta.text.value
    const display = isActiveNav(btn.key) ? convertToDoubleLines(raw) : raw
    out[btn.key] = buildPlainAnsiLines(display, meta.color.value, {
      defaultFgIdx: 14,
      maxLines: 4,
    })
  }
  return out
})

function expandHeaderLineParts(ln) {
  const parts = []
  for (const seg of ln.segments) {
    const text = seg.text
    let idx = 0
    while (idx < text.length) {
      const hit = text.indexOf(EDITOR_LINK_TEXT, idx)
      if (hit === -1) {
        if (idx < text.length) {
          parts.push({ seg: { ...seg, text: text.slice(idx) }, role: null })
        }
        break
      }
      if (hit > idx) {
        parts.push({ seg: { ...seg, text: text.slice(idx, hit) }, role: null })
      }
      parts.push({ seg: { ...seg, text: EDITOR_LINK_TEXT }, role: 'editor-link' })
      idx = hit + EDITOR_LINK_TEXT.length
    }
  }
  return parts
}

function navBtnRowKind(lineIndex) {
  if (lineIndex === 0) return 'top'
  if (lineIndex === 1) return 'empty'
  if (lineIndex === 2) return 'label'
  return 'bottom'
}

function expandButtonLineParts(ln, lineIndex, isActive) {
  if (lineIndex !== 2 || !isActive) {
    return ln.segments.map((seg) => ({ seg, role: null }))
  }

  const fullText = ln.segments.map((s) => s.text).join('')
  if (fullText.length < 2) {
    return ln.segments.map((seg) => ({ seg, role: null }))
  }

  const baseSeg = ln.segments[0] ?? {
    fgIdx: 14,
    bgIdx: null,
    hue: false,
    bright: false,
  }

  return [
    { seg: { ...baseSeg, text: fullText[0] }, role: 'border' },
    { seg: { ...baseSeg, text: fullText.slice(1, -1) }, role: 'interior' },
    { seg: { ...baseSeg, text: fullText[fullText.length - 1] }, role: 'border' },
  ]
}

function navLabelPartClass(role) {
  if (role === 'border') return 'nav-label-border'
  if (role === 'interior') return 'nav-label-interior'
  return null
}

function convertToDoubleLines(text) {
  return String(text ?? '')
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

function clsForSeg(seg) {
  return {
    'ansi-seg': true,
    'ansi-bright': Boolean(seg.bright),
    'ansi-hue': Boolean(seg.hue),
  }
}

function styleForSeg(seg, palette) {
  const st = {}
  if (seg.fgIdx != null) st.color = palette[seg.fgIdx] ?? undefined
  if (seg.bgIdx != null) st.backgroundColor = palette[seg.bgIdx] ?? undefined
  return st
}

function assetUrlFor(fileName) {
  return `${import.meta.env.BASE_URL || '/'}${fileName}`
}

function pickRandomHeader() {
  return AVAILABLE_HEADERS[Math.floor(Math.random() * AVAILABLE_HEADERS.length)]
}

function normalizeLoadedText(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').trimEnd()
}

async function fetchTextAsset(fileName) {
  const res = await fetch(assetUrlFor(fileName))
  if (!res.ok) throw new Error(`${fileName} (${res.status})`)
  return normalizeLoadedText(await res.text())
}

async function loadTextAndColors(fileName, textRef, colorRef) {
  try {
    const [text, colors] = await Promise.all([
      fetchTextAsset(fileName),
      loadDisplayAssetColorConfig(fileName),
    ])
    textRef.value = text
    colorRef.value = colors
  } catch {
    textRef.value = `${fileName} LOAD FAILED`
    colorRef.value = defaultHeaderColorConfig()
  }
}

async function loadLayoutAssets() {
  const headerFile = pickRandomHeader()
  currentHeaderFile.value = headerFile

  await Promise.all([
    loadTextAndColors(headerFile, rawHeaderText, headerColorCfg),
    loadTextAndColors(NOTEBOX_FILE, rawNoteboxText, noteboxColorCfg),
    loadTextAndColors(BUTTONTITLE_FILE, rawButtontitleText, buttontitleColorCfg),
    loadTextAndColors('btn_mocap.txt', rawBtnMocapText, btnMocapColorCfg),
    loadTextAndColors('btn_360cap.txt', rawBtn360capText, btn360capColorCfg),
    loadTextAndColors('btn_reference.txt', rawBtnReferenceText, btnReferenceColorCfg),
  ])
}

async function reloadColorConfigs() {
  headerColorCfg.value = await loadDisplayAssetColorConfig(currentHeaderFile.value)
  noteboxColorCfg.value = await loadDisplayAssetColorConfig(NOTEBOX_FILE)
  buttontitleColorCfg.value = await loadDisplayAssetColorConfig(BUTTONTITLE_FILE)
  btnMocapColorCfg.value = await loadDisplayAssetColorConfig('btn_mocap.txt')
  btn360capColorCfg.value = await loadDisplayAssetColorConfig('btn_360cap.txt')
  btnReferenceColorCfg.value = await loadDisplayAssetColorConfig('btn_reference.txt')
}

onMounted(() => {
  window.addEventListener('storage', () => {
    reloadColorConfigs()
  })
  loadLayoutAssets()
})
</script>

<template>
  <header class="ansi-header-root" aria-label="Seitenkopf">
    <div class="ansi-header-scanlines" aria-hidden="true" />
    <div class="ansi-header-wrap">
      <div class="ansi-header-stack">
        <div class="ansi-vga ansi-header-top-spacer" aria-hidden="true" />
        <div class="ansi-header-canvas">
          <pre class="ansi-vga ansi-pre" aria-label="Header-Grafik (ANSI)"><template
            v-for="(ln, li) in headerLines"
            :key="`h-${li}`"
          ><template
            v-for="(part, pi) in expandHeaderLineParts(ln)"
            :key="`h-${li}-${pi}`"
          ><button
            v-if="part.role === 'editor-link'"
            type="button"
            class="ansi-editor-link"
            :class="clsForSeg(part.seg)"
            :style="styleForSeg(part.seg, headerPalette)"
            :aria-label="`${EDITOR_LINK_TEXT} — Editor öffnen`"
            @click="emit('enter-editor')"
          >{{ part.seg.text }}</button><span
            v-else
            :class="clsForSeg(part.seg)"
            :style="styleForSeg(part.seg, headerPalette)"
          >{{ part.seg.text }}</span></template><span class="ansi-nl"></span></template></pre>
        </div>

        <div class="ansi-vga ansi-header-line-spacer ansi-header-line-spacer--double" aria-hidden="true" />
        <pre class="ansi-vga ansi-notebox" aria-label="Hinweis"><template
          v-for="(ln, li) in noteboxLines"
          :key="`n-${li}`"
        ><span
          v-for="(seg, si) in ln.segments"
          :key="`n-${li}-${si}`"
          :class="clsForSeg(seg)"
          :style="styleForSeg(seg, noteboxPalette)"
        >{{ seg.text }}</span><span class="ansi-nl"></span></template></pre>
        <div class="ansi-vga ansi-header-line-spacer ansi-header-line-spacer--double" aria-hidden="true" />

        <pre class="ansi-vga ansi-buttontitle" aria-label="Navigationstitel"><template
          v-for="(ln, li) in buttontitleLines"
          :key="`t-${li}`"
        ><span
          v-for="(seg, si) in ln.segments"
          :key="`t-${li}-${si}`"
          :class="clsForSeg(seg)"
          :style="styleForSeg(seg, buttontitlePalette)"
        >{{ seg.text }}</span><span class="ansi-nl"></span></template></pre>

        <nav class="ansi-nav" aria-label="Galerie-Navigation">
          <button
            v-for="btn in NAV_BUTTONS"
            :key="btn.key"
            type="button"
            class="ansi-nav-btn"
            :class="{ 'is-active': isActiveNav(btn.key) }"
            :aria-current="isActiveNav(btn.key) ? 'page' : undefined"
            :aria-label="btn.label"
            @click="emit('select-gallery', btn.key)"
          >
            <pre class="ansi-vga ansi-nav-btn-pre" aria-hidden="true"><template
              v-for="(ln, li) in buttonLines[btn.key]"
              :key="`${btn.key}-${li}`"
            ><span
              class="ansi-nav-btn-row"
              :class="`ansi-nav-btn-row--${navBtnRowKind(li)}`"
            ><span
              v-for="(part, pi) in expandButtonLineParts(ln, li, isActiveNav(btn.key))"
              :key="`${btn.key}-${li}-${pi}`"
              :class="[clsForSeg(part.seg), navLabelPartClass(part.role)]"
              :style="styleForSeg(part.seg, buttonMeta[btn.key].palette)"
            >{{ part.seg.text }}</span></span></template></pre>
          </button>
        </nav>
      </div>
    </div>
  </header>
</template>

<style scoped>
.ansi-header-root {
  position: relative;
  z-index: 40;
  overflow: visible;
}

.ansi-header-wrap {
  box-sizing: border-box;
  width: 100%;
  overflow: visible;
  display: flex;
  justify-content: center;
  padding: clamp(8px, 1.8vw, 16px) clamp(8px, 1.6vw, 14px)
    clamp(6px, 1.2vw, 12px);
}

.ansi-header-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  width: 100%;
  max-width: 960px;
}

.ansi-header-top-spacer,
.ansi-header-line-spacer {
  display: block;
  width: 1px;
  flex-shrink: 0;
}

.ansi-header-line-spacer {
  height: calc(0.99 * 1em);
}

.ansi-header-line-spacer--double {
  height: calc(2 * 0.99 * 1em);
}

.ansi-header-top-spacer {
  height: calc(2 * 0.99 * 1em);
}

.ansi-header-canvas {
  box-sizing: border-box;
  width: 100%;
  overflow: visible;
  display: flex;
  justify-content: center;
  background: transparent;
}

.ansi-notebox {
  display: inline-block;
  width: 100%;
  text-align: center;
  color: #ff5555;
  text-shadow: 0 0 12px rgb(255 85 85 / 0.22);
  filter: brightness(1.08);
}

.ansi-buttontitle {
  display: inline-block;
  width: 100%;
  text-align: center;
  color: #e5e7eb;
  margin-bottom: 0;
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

.ansi-vga {
  white-space: pre;
  margin: 0;
  font-family: 'Web437 IBM VGA 9x16', 'Web437 IBM VGA 8x14 2x',
    'Web437 IBM VGA 8x14', ui-monospace, monospace;
  font-size: clamp(12px, 1.5vw, 18px);
  line-height: 0.99;
  letter-spacing: -0.5px;
  text-rendering: optimizeLegibility;
  shape-rendering: crispEdges;
  -webkit-font-smoothing: subpixel-antialiased;
  -moz-osx-font-smoothing: auto;
}

.ansi-pre {
  display: inline-block;
  color: #e5e7eb;
  text-shadow: 0 0 10px rgb(250 204 21 / 0.16);
  background-color: transparent;
}

.ansi-editor-link {
  display: inline;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  font: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  text-shadow: inherit;
  color: inherit;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.ansi-editor-link:hover {
  filter: brightness(1.2);
}

.ansi-editor-link:focus-visible {
  outline: 2px solid rgb(250 204 21 / 0.85);
  outline-offset: 2px;
}

.ansi-nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: clamp(10px, 2vw, 18px);
  width: 100%;
}

.ansi-nav-btn {
  box-sizing: border-box;
  display: inline-block;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.ansi-nav-btn-pre {
  display: inline-block;
  background-color: #000;
  line-height: 0.99;
}

.ansi-nav-btn-row {
  display: block;
  white-space: pre;
  line-height: 0.99;
  letter-spacing: inherit;
  background-color: #000;
}

/* Default + inaktiv: gelber Vordergrund auf schwarzem Grund */
.ansi-nav-btn:not(:hover) .ansi-nav-btn-pre .ansi-seg:not(.nav-label-interior) {
  color: #facc15 !important;
  background-color: transparent !important;
  animation: none !important;
  filter: none !important;
  text-shadow: none;
}

/* Active: gelbe Rahmen, Textzeile Innenfläche immer gelb (ohne 1./letztes Zeichen) */
.ansi-nav-btn.is-active .nav-label-border {
  color: #facc15 !important;
  background-color: #000 !important;
}

.ansi-nav-btn.is-active .nav-label-interior {
  color: #000 !important;
  background-color: #facc15 !important;
}

/* Hover: Inversion nur auf den 4 Zeilen-Blöcken — nicht auf dem <pre>-Container */
.ansi-nav-btn:hover .ansi-nav-btn-row {
  background-color: #facc15 !important;
  color: #000 !important;
}

.ansi-nav-btn:hover .ansi-nav-btn-pre {
  background-color: transparent !important;
}

.ansi-nav-btn:hover .ansi-nav-btn-row .ansi-seg:not(.nav-label-interior),
.ansi-nav-btn:hover .ansi-nav-btn-row .nav-label-border {
  color: #000 !important;
  background-color: transparent !important;
  animation: none !important;
  filter: none !important;
  text-shadow: none;
}

.ansi-nav-btn.is-active:hover .nav-label-interior {
  color: #000 !important;
  background-color: #facc15 !important;
}

.ansi-nav-btn:focus-visible {
  outline: 2px solid rgb(250 204 21 / 0.85);
  outline-offset: 2px;
}

@media (max-width: 500px) {
  .ansi-vga {
    font-size: 2.4vw !important;
  }
}

.ansi-vga::selection,
.ansi-vga *::selection {
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

.ansi-bright {
  filter: brightness(1.08);
}

.ansi-hue {
  display: inline;
  animation: hueCycle 20s linear infinite;
  will-change: filter;
}
</style>
