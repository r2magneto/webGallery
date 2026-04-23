<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  VGA_PALETTE,
  downloadHeaderColorConfig,
  importHeaderColorConfig,
  loadHeaderColorConfig,
  loadProjectHeaderColorConfig,
  saveHeaderColorConfig,
} from '../utils/headerColorConfig.js'

const ANSI_URL = `${import.meta.env.BASE_URL || '/'}Header_01_01_BW.utf8ans`

const rawText = ref('')
const lines = computed(() => String(rawText.value || '').replace(/\r\n/g, '\n').split('\n'))

const cfg = ref(loadHeaderColorConfig())
const loadError = ref('')
const fileInputRef = ref(null)

const selectedFg = ref(14)
const selectedBg = ref(null)

const paintMode = ref('fg') // 'fg' | 'bg'
const painting = ref(false)
const paintValue = computed(() =>
  paintMode.value === 'fg' ? selectedFg.value : selectedBg.value,
)

function ensureCell(lineIdx, colIdx) {
  const c = cfg.value
  while (c.cells.length <= lineIdx) c.cells.push([])
  const row = c.cells[lineIdx]
  while (row.length <= colIdx) row.push(null)
  if (!row[colIdx]) row[colIdx] = { fg: null, bg: null }
  return row[colIdx]
}

function setCell(lineIdx, colIdx) {
  const cell = ensureCell(lineIdx, colIdx)
  if (paintMode.value === 'fg') cell.fg = paintValue.value
  else cell.bg = paintValue.value
}

function clearCell(lineIdx, colIdx) {
  const cell = ensureCell(lineIdx, colIdx)
  if (paintMode.value === 'fg') cell.fg = null
  else cell.bg = null
}

function onCellPointerDown(e, li, ci) {
  e.preventDefault()
  painting.value = true
  if (e.button === 2) clearCell(li, ci)
  else setCell(li, ci)
}

function onCellPointerEnter(e, li, ci) {
  if (!painting.value) return
  e.preventDefault()
  if (e.buttons === 2) clearCell(li, ci)
  else setCell(li, ci)
}

function onPointerUp() {
  painting.value = false
}

function cellStyle(li, ci) {
  const cell = cfg.value.cells?.[li]?.[ci]
  const st = {}
  if (cell?.fg != null) st.color = VGA_PALETTE[cell.fg]
  if (cell?.bg != null) st.backgroundColor = VGA_PALETTE[cell.bg]
  return st
}

function toggleCycle(idx) {
  cfg.value.cycle[idx] = !cfg.value.cycle[idx]
}

function setSelectedFrom(idx, kind) {
  if (kind === 'fg') selectedFg.value = idx
  else selectedBg.value = idx
}

async function onLoadProject() {
  loadError.value = ''
  const project = await loadProjectHeaderColorConfig()
  if (!project) {
    loadError.value = 'Keine projectweite header-colors.json gefunden.'
    return
  }
  cfg.value = project
  saveHeaderColorConfig(cfg.value)
}

function onPickFile() {
  loadError.value = ''
  fileInputRef.value?.click?.()
}

async function onFileChange(e) {
  loadError.value = ''
  const file = e.target?.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const json = JSON.parse(text)
    cfg.value = importHeaderColorConfig(json)
    saveHeaderColorConfig(cfg.value)
  } catch {
    loadError.value = 'Import fehlgeschlagen (kein gültiges JSON).'
  } finally {
    e.target.value = ''
  }
}

watch(
  cfg,
  () => {
    saveHeaderColorConfig(cfg.value)
  },
  { deep: true },
)

onMounted(async () => {
  const res = await fetch(ANSI_URL)
  rawText.value = await res.text()
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('pointercancel', onPointerUp, true)
})
</script>

<template>
  <section class="header-editor-root">
    <header class="header-editor-toolbar">
      <div class="header-editor-toolbar__left">
        <span class="header-editor-label">Header-Farb-Editor</span>
        <input
          ref="fileInputRef"
          type="file"
          accept="application/json"
          class="hidden"
          @change="onFileChange"
        />
        <button
          type="button"
          class="header-editor-btn"
          @click="downloadHeaderColorConfig(cfg)"
        >
          Download JSON
        </button>
        <button type="button" class="header-editor-btn" @click="onPickFile">
          Load JSON
        </button>
        <button type="button" class="header-editor-btn" @click="onLoadProject">
          Load project default
        </button>
      </div>

      <div class="header-editor-toolbar__right">
        <div class="header-editor-mode">
          <button
            type="button"
            class="header-editor-chip"
            :class="paintMode === 'fg' ? 'header-editor-chip--on' : ''"
            @click="paintMode = 'fg'"
          >
            Vordergrund
          </button>
          <button
            type="button"
            class="header-editor-chip"
            :class="paintMode === 'bg' ? 'header-editor-chip--on' : ''"
            @click="paintMode = 'bg'"
          >
            Hintergrund
          </button>
          <button
            type="button"
            class="header-editor-chip"
            @click="paintMode === 'fg' ? (selectedFg = null) : (selectedBg = null)"
            title="Aus / transparent"
          >
            Aus
          </button>
        </div>
      </div>
    </header>

    <div class="header-editor-palette">
      <div class="header-editor-palette__grid" role="group" aria-label="VGA Palette">
        <div
          v-for="(col, idx) in VGA_PALETTE"
          :key="idx"
          class="header-editor-swatch"
        >
          <button
            type="button"
            class="header-editor-swatch__color"
            :style="{ backgroundColor: col }"
            :class="
              (paintMode === 'fg' && selectedFg === idx) ||
              (paintMode === 'bg' && selectedBg === idx)
                ? 'header-editor-swatch__color--sel'
                : ''
            "
            @click="setSelectedFrom(idx, paintMode)"
            :aria-label="`Farbe ${idx}`"
          />
          <label class="header-editor-swatch__cycle">
            <input
              type="checkbox"
              :checked="cfg.cycle[idx]"
              @change="toggleCycle(idx)"
            />
            <span>cycle</span>
          </label>
        </div>
      </div>
      <p class="header-editor-hint">
        Malen: linke Taste färbt · rechte Taste löscht · gedrückt halten &amp; ziehen.
      </p>
      <p v-if="loadError" class="header-editor-error" role="status">
        {{ loadError }}
      </p>
    </div>

    <div class="header-editor-canvas">
      <pre class="header-editor-pre" @contextmenu.prevent>
<template v-for="(ln, li) in lines" :key="li"><span
  v-for="(ch, ci) in [...ln]"
  :key="`${li}-${ci}`"
  class="header-editor-cell"
  :style="cellStyle(li, ci)"
  @pointerdown="onCellPointerDown($event, li, ci)"
  @pointerenter="onCellPointerEnter($event, li, ci)"
>{{ ch }}</span><span class="header-editor-nl">
</span></template>
      </pre>
    </div>
  </section>
</template>

<style scoped>
.header-editor-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgb(255 255 255 / 0.12);
  background: rgb(2 6 23 / 0.65);
  backdrop-filter: blur(8px);
  border-radius: 12px;
}

.header-editor-toolbar__left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.header-editor-toolbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-editor-label {
  font-size: 13px;
  font-weight: 700;
  color: rgb(226 232 240);
}

.header-editor-btn {
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgb(255 255 255 / 0.18);
  background: rgb(15 23 42 / 0.8);
  color: rgb(226 232 240);
  font-size: 12px;
}

.header-editor-mode {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.header-editor-chip {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 0.14);
  background: transparent;
  color: rgb(148 163 184);
  font-size: 12px;
}

.header-editor-chip--on {
  color: rgb(250 204 21);
  border-color: rgb(250 204 21 / 0.55);
  box-shadow: 0 0 0 1px rgb(250 204 21 / 0.2) inset;
}

.header-editor-palette {
  padding: 10px 12px;
  border: 1px solid rgb(255 255 255 / 0.12);
  background: rgb(2 6 23 / 0.35);
  border-radius: 12px;
}

.header-editor-palette__grid {
  display: grid;
  grid-template-columns: repeat(16, minmax(0, 1fr));
  gap: 8px;
}

.header-editor-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.header-editor-swatch__color {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgb(255 255 255 / 0.25);
}

.header-editor-swatch__color--sel {
  outline: 2px solid rgb(250 204 21 / 0.9);
  outline-offset: 2px;
}

.header-editor-swatch__cycle {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 10px;
  color: rgb(148 163 184);
  user-select: none;
}

.header-editor-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: rgb(148 163 184);
}

.header-editor-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgb(248 113 113);
}

.header-editor-canvas {
  padding: 12px;
  border: 1px solid rgb(255 255 255 / 0.12);
  border-radius: 12px;
  background: rgb(0 0 0 / 0.35);
  overflow: auto;
}

.header-editor-pre {
  margin: 0;
  white-space: pre;
  font-family: 'Web437 IBM VGA 9x16', 'Web437 IBM VGA 8x14 2x',
    'Web437 IBM VGA 8x14', ui-monospace, monospace;
  font-size: 16px;
  line-height: 16px;
  letter-spacing: 0;
  user-select: none;
}

.header-editor-cell {
  display: inline-block;
  width: 1ch;
  height: 1em;
  color: #cbd5e1;
}

.header-editor-nl {
  display: block;
  height: 0;
}
</style>

