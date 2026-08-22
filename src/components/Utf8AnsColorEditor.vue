<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ROW_SIZE, hexToRgb, normalizePalette, rgbToHex } from '../utils/ansiPalette.js'
import { centerPadPlainLines } from '../utils/ansiPlainRender.js'

const props = defineProps({
  title: { type: String, required: true },
  assetFileName: { type: String, default: '' },
  /** @deprecated Use assetFileName */
  ansiFileName: { type: String, default: '' },
  loadConfig: { type: Function, required: true },
  saveConfig: { type: Function, required: true },
  loadProjectConfig: { type: Function, required: true },
  importConfig: { type: Function, required: true },
  downloadConfig: { type: Function, required: true },
  projectMissingMessage: { type: String, required: true },
  /** Pad each line to this many character cells (trailing spaces stay paintable). */
  minLineWidth: { type: Number, default: 0 },
})

const resolvedFileName = computed(() => props.assetFileName || props.ansiFileName)

const assetUrl = computed(
  () => `${import.meta.env.BASE_URL || '/'}${resolvedFileName.value}`,
)

const rawText = ref('')
const lines = computed(() => String(rawText.value || '').replace(/\r\n/g, '\n').split('\n'))

const cfg = ref(props.loadConfig())
const loadError = ref('')
const fileInputRef = ref(null)
const pickerDialogRef = ref(null)

const selectedFg = ref(14)
const selectedBg = ref(null)

const paintMode = ref('fg')
const painting = ref(false)
const paintValue = computed(() =>
  paintMode.value === 'fg' ? selectedFg.value : selectedBg.value,
)

const paletteColors = computed(() => normalizePalette(cfg.value.palette))

const editIdx = ref(0)
const editR = ref(0)
const editG = ref(0)
const editB = ref(0)

const editHex = computed(() => rgbToHex(editR.value, editG.value, editB.value))

function rowIndices(row) {
  const start = row * ROW_SIZE
  return Array.from({ length: ROW_SIZE }, (_, i) => start + i)
}

function ensurePalette() {
  cfg.value.palette = normalizePalette(cfg.value.palette)
}

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
  if (cell?.fg != null) st.color = paletteColors.value[cell.fg]
  if (cell?.bg != null) st.backgroundColor = paletteColors.value[cell.bg]
  return st
}

function isSwatchSelected(idx) {
  return (
    (paintMode.value === 'fg' && selectedFg.value === idx) ||
    (paintMode.value === 'bg' && selectedBg.value === idx)
  )
}

function toggleCycle(idx) {
  cfg.value.cycle[idx] = !cfg.value.cycle[idx]
}

function setSelectedFrom(idx) {
  if (paintMode.value === 'fg') selectedFg.value = idx
  else selectedBg.value = idx
}

function openPicker(idx) {
  ensurePalette()
  editIdx.value = idx
  const { r, g, b } = hexToRgb(paletteColors.value[idx])
  editR.value = r
  editG.value = g
  editB.value = b
  pickerDialogRef.value?.showModal?.()
}

function onPickerNativeColor(e) {
  const { r, g, b } = hexToRgb(e.target.value)
  editR.value = r
  editG.value = g
  editB.value = b
}

function applyPicker() {
  ensurePalette()
  cfg.value.palette[editIdx.value] = editHex.value
  pickerDialogRef.value?.close?.()
}

function onPickerCancel() {
  pickerDialogRef.value?.close?.()
}

async function onLoadProject() {
  loadError.value = ''
  const project = await props.loadProjectConfig()
  if (!project) {
    loadError.value = props.projectMissingMessage
    return
  }
  cfg.value = project
  props.saveConfig(cfg.value)
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
    cfg.value = props.importConfig(json)
    props.saveConfig(cfg.value)
  } catch {
    loadError.value = 'Import fehlgeschlagen (kein gültiges JSON).'
  } finally {
    e.target.value = ''
  }
}

watch(
  cfg,
  () => {
    props.saveConfig(cfg.value)
  },
  { deep: true },
)

async function loadAssetText() {
  if (!resolvedFileName.value) return
  const res = await fetch(assetUrl.value)
  if (!res.ok) {
    loadError.value = `${resolvedFileName.value} konnte nicht geladen werden (${res.status}).`
    rawText.value = ''
    return
  }
  loadError.value = ''
  rawText.value = centerPadPlainLines(await res.text(), props.minLineWidth)
}

watch(resolvedFileName, () => {
  cfg.value = props.loadConfig()
  ensurePalette()
  loadAssetText()
})

onMounted(async () => {
  ensurePalette()
  await loadAssetText()
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('pointercancel', onPointerUp, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', onPointerUp, true)
  window.removeEventListener('pointercancel', onPointerUp, true)
})
</script>

<template>
  <section class="header-editor-root">
    <header class="header-editor-toolbar">
      <div class="header-editor-toolbar__left">
        <span class="header-editor-label">{{ title }}</span>
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
          @click="downloadConfig(cfg)"
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
      <p class="header-editor-palette__row-label">Standard</p>
      <div class="header-editor-palette__grid" role="group" aria-label="VGA Palette Zeile 1">
        <div
          v-for="idx in rowIndices(0)"
          :key="idx"
          class="header-editor-swatch"
        >
          <button
            type="button"
            class="header-editor-swatch__color"
            :style="{ backgroundColor: paletteColors[idx] }"
            :class="isSwatchSelected(idx) ? 'header-editor-swatch__color--sel' : ''"
            @click="setSelectedFrom(idx)"
            @dblclick.prevent="openPicker(idx)"
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

      <p class="header-editor-palette__row-label">Halbe Helligkeit</p>
      <div
        class="header-editor-palette__grid header-editor-palette__grid--dim"
        role="group"
        aria-label="VGA Palette Zeile 2"
      >
        <div
          v-for="idx in rowIndices(1)"
          :key="idx"
          class="header-editor-swatch"
        >
          <button
            type="button"
            class="header-editor-swatch__color"
            :style="{ backgroundColor: paletteColors[idx] }"
            :class="isSwatchSelected(idx) ? 'header-editor-swatch__color--sel' : ''"
            @click="setSelectedFrom(idx)"
            @dblclick.prevent="openPicker(idx)"
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
        Doppelklick auf eine Farbe: RGB anpassen.
      </p>
      <p v-if="loadError" class="header-editor-error" role="status">
        {{ loadError }}
      </p>
      <p v-if="resolvedFileName" class="header-editor-file">
        Datei: <code>{{ resolvedFileName }}</code>
      </p>
    </div>

    <dialog
      ref="pickerDialogRef"
      class="palette-picker"
      @cancel.prevent="onPickerCancel"
    >
      <form method="dialog" class="palette-picker__form" @submit.prevent="applyPicker">
        <h2 class="palette-picker__title">Farbe {{ editIdx }} anpassen</h2>
        <div
          class="palette-picker__preview"
          :style="{ backgroundColor: editHex }"
          aria-hidden="true"
        />
        <label class="palette-picker__field">
          <span>R</span>
          <input v-model.number="editR" type="range" min="0" max="255" />
          <input v-model.number="editR" type="number" min="0" max="255" class="palette-picker__num" />
        </label>
        <label class="palette-picker__field">
          <span>G</span>
          <input v-model.number="editG" type="range" min="0" max="255" />
          <input v-model.number="editG" type="number" min="0" max="255" class="palette-picker__num" />
        </label>
        <label class="palette-picker__field">
          <span>B</span>
          <input v-model.number="editB" type="range" min="0" max="255" />
          <input v-model.number="editB" type="number" min="0" max="255" class="palette-picker__num" />
        </label>
        <label class="palette-picker__field palette-picker__field--hex">
          <span>Hex</span>
          <input :value="editHex" type="text" readonly class="palette-picker__hex" />
          <input
            type="color"
            :value="editHex"
            class="palette-picker__native"
            @input="onPickerNativeColor"
          />
        </label>
        <div class="palette-picker__actions">
          <button type="button" class="header-editor-btn" @click="onPickerCancel">
            Abbrechen
          </button>
          <button type="submit" class="header-editor-btn palette-picker__apply">
            Übernehmen
          </button>
        </div>
      </form>
    </dialog>

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
  cursor: pointer;
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
  cursor: pointer;
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

.header-editor-palette__row-label {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgb(148 163 184);
}

.header-editor-palette__row-label:not(:first-child) {
  margin-top: 12px;
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
  cursor: pointer;
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

.header-editor-file {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgb(148 163 184);
}

.header-editor-file code {
  font-family: ui-monospace, monospace;
  color: rgb(226 232 240);
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

.palette-picker {
  margin: auto;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 0.2);
  border-radius: 14px;
  background: rgb(15 23 42);
  color: rgb(226 232 240);
  max-width: min(420px, 92vw);
}

.palette-picker::backdrop {
  background: rgb(0 0 0 / 0.55);
}

.palette-picker__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px 16px;
}

.palette-picker__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.palette-picker__preview {
  height: 48px;
  border-radius: 10px;
  border: 1px solid rgb(255 255 255 / 0.2);
}

.palette-picker__field {
  display: grid;
  grid-template-columns: 1.5rem 1fr 3.5rem;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.palette-picker__field--hex {
  grid-template-columns: 1.5rem 1fr auto;
}

.palette-picker__num {
  width: 100%;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid rgb(255 255 255 / 0.15);
  background: rgb(2 6 23);
  color: inherit;
  font-size: 12px;
}

.palette-picker__hex {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgb(255 255 255 / 0.15);
  background: rgb(2 6 23);
  color: inherit;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.palette-picker__native {
  width: 36px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.palette-picker__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.palette-picker__apply {
  background: rgb(5 150 105);
  border-color: rgb(16 185 129 / 0.5);
}
</style>
