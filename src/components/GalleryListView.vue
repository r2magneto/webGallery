<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { publicAssetUrl } from '../utils/publicAssetUrl.js'
import { scheduleResizeLenis } from '../lenisClient.js'

const loadState = ref('loading')
const error = ref('')
const sections = ref([])

/** Welche Panel-IDs sind aufgeklappt (initial: alle zu) */
const openIds = ref(new Set())

const ABOUT_URL = publicAssetUrl('about.json')

async function loadAbout() {
  loadState.value = 'loading'
  error.value = ''
  try {
    const res = await fetch(ABOUT_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`about.json (${res.status})`)
    const data = await res.json()
    if (!Array.isArray(data.sections)) throw new Error('Ungültiges about.json')
    sections.value = data.sections
  } catch (e) {
    sections.value = []
    error.value =
      e instanceof Error ? e.message : 'about.json konnte nicht geladen werden.'
  } finally {
    loadState.value = 'idle'
  }
}

function isOpen(id) {
  return openIds.value.has(id)
}

function toggleSection(id) {
  const next = new Set(openIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openIds.value = next
  nextTick(() => scheduleResizeLenis())
}

function onSectionKeydown(e, id) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleSection(id)
  }
}

/** Innenbreite der Panel-Rahmen (Zeichen zwischen ║) */
const PANEL_INNER_W = 68

function padInner(text, width = PANEL_INNER_W) {
  const t = String(text ?? '')
  const clipped = t.length > width ? t.slice(0, width) : t
  return clipped.padEnd(width)
}

function boxRow(inner) {
  return `║${padInner(inner)}║`
}

function boxTop(title) {
  const inner = ` ${title} `
  const w = Math.max(PANEL_INNER_W, inner.length)
  const line = '═'.repeat(w)
  return {
    top: `╔${line}╗`,
    title: `║${padInner(inner, w)}║`,
    innerW: w,
  }
}

function boxSep(w = PANEL_INNER_W) {
  return `╠${'═'.repeat(w)}╣`
}

function boxBottom(w = PANEL_INNER_W) {
  return `╚${'═'.repeat(w)}╝`
}

function tableRow(cols, widths) {
  const parts = cols.map((c, i) => {
    const w = widths[i] ?? 20
    const s = String(c ?? '')
    return s.length > w ? s.slice(0, w) : s.padEnd(w)
  })
  return boxRow(parts.join(' '))
}

const tableColWidths = [22, 30, 6]

function tableBlock(sec, w = PANEL_INNER_W) {
  const cols = sec.columns ?? ['CLIENT', 'PROJECT', 'YEAR']
  const lines = [
    tableRow(cols, tableColWidths),
    tableRow(['─'.repeat(22), '─'.repeat(30), '────'], tableColWidths),
  ]
  for (const row of sec.entries ?? []) {
    lines.push(tableRow([row.client, row.project, row.year], tableColWidths))
  }
  return lines.join('\n')
}

const sectionFrames = computed(() =>
  sections.value.map((sec) => {
    const frame = boxTop(sec.title ?? sec.id ?? 'SECTION')
    const w = frame.innerW
    const tableText = sec.type === 'table' ? tableBlock(sec, w) : ''
    return { ...sec, frame, innerW: w, tableText }
  }),
)

onMounted(() => {
  loadAbout()
})
</script>

<template>
  <div class="nc-root" aria-label="About and references">
    <div class="nc-wrap w-full px-[10%] pb-28 pt-8">
      <pre class="nc-screen-title" aria-hidden="true">╔══════════════════════════════════════════════════════════════════════╗
║  NORTON COMMANDER — ABOUT AND REFERENCE INDEX  v1.0                    ║
╚══════════════════════════════════════════════════════════════════════╝</pre>

      <p v-if="loadState === 'loading'" class="nc-status">Loading about.json …</p>
      <p v-else-if="error" class="nc-status nc-status--error">{{ error }}</p>

      <div v-else class="nc-panels">
        <section
          v-for="sec in sectionFrames"
          :key="sec.id"
          class="nc-panel"
          :class="{ 'nc-panel--open': isOpen(sec.id) }"
        >
          <button
            type="button"
            class="nc-panel-hit"
            :aria-expanded="isOpen(sec.id)"
            :aria-controls="`nc-panel-body-${sec.id}`"
            @click="toggleSection(sec.id)"
            @keydown="onSectionKeydown($event, sec.id)"
          >
            <pre class="nc-panel-pre" aria-hidden="true">{{ sec.frame.top }}
{{ sec.frame.title }}{{ isOpen(sec.id) ? '' : '\n' + boxBottom(sec.innerW) }}</pre>
            <span class="nc-panel-chevron" aria-hidden="true">{{
              isOpen(sec.id) ? '▼' : '►'
            }}</span>
          </button>

          <div
            v-show="isOpen(sec.id)"
            :id="`nc-panel-body-${sec.id}`"
            class="nc-panel-body"
          >
            <pre class="nc-panel-pre nc-panel-pre--body">{{ boxSep(sec.innerW) }}</pre>

            <div v-if="sec.type === 'text'" class="nc-panel-content">
              <pre
                v-for="(para, pi) in sec.paragraphs"
                :key="pi"
                class="nc-text-block"
              >{{ para }}</pre>
            </div>

            <div v-else-if="sec.type === 'table'" class="nc-panel-content">
              <pre class="nc-panel-pre nc-table">{{ sec.tableText }}</pre>
            </div>

            <pre class="nc-panel-pre nc-panel-pre--body">{{ boxBottom(sec.innerW) }}</pre>
          </div>
        </section>
      </div>

      <p class="nc-hint">Press panel header to expand · F10=Menu · Esc=Back (not wired)</p>
    </div>
  </div>
</template>

<style scoped>
.nc-root {
  position: relative;
  z-index: 5;
  min-height: 60svh;
  color: #ffffff;
}

.nc-wrap {
  max-width: 100%;
  margin: 0 auto;
}

.nc-screen-title,
.nc-panel-pre,
.nc-text-block,
.nc-table,
.nc-status,
.nc-hint {
  margin: 0;
  font-family: 'Web437 IBM VGA 9x16', 'Web437 IBM VGA 8x14 2x',
    'Web437 IBM VGA 8x14', ui-monospace, monospace;
  font-size: clamp(11px, 1.55vw, 20px);
  line-height: 1.02;
  letter-spacing: -0.5px;
  white-space: pre;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: subpixel-antialiased;
}

.nc-screen-title {
  margin-bottom: clamp(20px, 3vw, 32px);
  color: #ffff55;
  text-shadow: none;
}

.nc-status {
  color: #aaaaaa;
}

.nc-status--error {
  color: #ff5555;
}

.nc-panels {
  display: flex;
  flex-direction: column;
  gap: clamp(18px, 2.5vw, 28px);
}

/*
 * Norton Commander / Norton Utilities Panel:
 * DOS-Blau, harter schwarzer Schatten (kein Blur).
 */
.nc-panel {
  position: relative;
  max-width: 100%;
  background: #0000aa;
  box-shadow: 6px 6px 0 #000000;
  border: 2px solid #000000;
}

.nc-panel-hit {
  position: relative;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: #5555ff;
  color: #ffffff;
  cursor: pointer;
  text-align: left;
  -webkit-appearance: none;
  appearance: none;
}

.nc-panel-hit:hover,
.nc-panel-hit:focus-visible {
  background: #ffff55;
  color: #000000;
}

.nc-panel-hit:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

.nc-panel-chevron {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  pointer-events: none;
}

.nc-panel-pre {
  color: #ffffff;
  overflow-x: auto;
}

.nc-panel-hit .nc-panel-pre {
  color: #000000;
  background: transparent;
}

.nc-panel-hit:hover .nc-panel-pre,
.nc-panel-hit:focus-visible .nc-panel-pre {
  color: #000000;
}

.nc-panel-body {
  padding: 0 0 2px;
  background: #0000aa;
}

.nc-panel-pre--body {
  color: #ffffff;
}

.nc-panel-content {
  padding: 8px 10px 10px;
  color: #ffffff;
}

.nc-text-block {
  margin: 0 0 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #dddddd;
  line-height: 1.35;
}

.nc-text-block:last-child {
  margin-bottom: 0;
}

.nc-table {
  color: #ffffff;
}

.nc-hint {
  margin-top: clamp(24px, 3vw, 36px);
  color: #6b7280;
  font-size: clamp(10px, 1.4vw, 16px);
}
</style>
