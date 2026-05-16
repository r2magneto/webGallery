<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { buildPlainAnsiLines } from '../utils/ansiPlainRender.js'
import { loadRefAboutColorConfig, resolvePalette } from '../utils/refAboutColorConfig.js'
import { decodeBestEffort } from '../utils/utf8ansDecode.js'
import { scheduleResizeLenis } from '../lenisClient.js'

const ANSI_URL = `${import.meta.env.BASE_URL || '/'}ref-about_01_BW.utf8ans`

const loadState = ref('loading')
const error = ref('')
const rawText = ref('')
const colorCfg = ref(loadRefAboutColorConfig())

const palette = computed(() => resolvePalette(colorCfg.value))
const ansiLines = computed(() => buildPlainAnsiLines(rawText.value, colorCfg.value))

function clsForSeg(seg) {
  return {
    'ansi-seg': true,
    'ansi-bright': Boolean(seg.bright),
    'ansi-hue': Boolean(seg.hue),
  }
}

function styleForSeg(seg) {
  const st = {}
  if (seg.fgIdx != null) st.color = palette.value[seg.fgIdx] ?? undefined
  if (seg.bgIdx != null) st.backgroundColor = palette.value[seg.bgIdx] ?? undefined
  return st
}

async function loadArt() {
  loadState.value = 'loading'
  error.value = ''
  try {
    const res = await fetch(ANSI_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`ref-about_01_BW.utf8ans (${res.status})`)
    const buf = await res.arrayBuffer()
    rawText.value = decodeBestEffort(new Uint8Array(buf)).replace(/\n+$/, '')
  } catch (e) {
    rawText.value = ''
    error.value =
      e instanceof Error ? e.message : 'ASCII-Grafik konnte nicht geladen werden.'
  } finally {
    loadState.value = 'idle'
    nextTick(() => scheduleResizeLenis())
  }
}

onMounted(() => {
  window.addEventListener('storage', () => {
    colorCfg.value = loadRefAboutColorConfig()
    nextTick(() => scheduleResizeLenis())
  })
  loadArt()
})
</script>

<template>
  <div class="ref-about-root" aria-label="References and about">
    <div class="ref-about-wrap w-full px-[10%] pb-0 pt-2">
      <p v-if="loadState === 'loading'" class="ref-about-status">Lade Grafik …</p>
      <p v-else-if="error" class="ref-about-status ref-about-status--error">{{ error }}</p>

      <div v-else class="ref-about-canvas">
        <pre class="ref-about-pre" aria-label="References and about (ANSI)">
<template v-for="(ln, li) in ansiLines" :key="li"><span
  v-for="(seg, si) in ln.segments"
  :key="`${li}-${si}`"
  :class="clsForSeg(seg)"
  :style="styleForSeg(seg)"
>{{ seg.text }}</span><span class="ansi-nl"></span></template>
        </pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ref-about-root {
  position: relative;
  z-index: 5;
  min-height: 0;
  color: #ffffff;
}

.ref-about-wrap {
  max-width: 100%;
  margin: 0 auto;
}

.ref-about-status {
  margin: 0;
  font-family: 'Web437 IBM VGA 9x16', 'Web437 IBM VGA 8x14 2x',
    'Web437 IBM VGA 8x14', ui-monospace, monospace;
  font-size: clamp(11px, 1.55vw, 20px);
  color: #aaaaaa;
}

.ref-about-status--error {
  color: #ff5555;
}

.ref-about-canvas {
  display: flex;
  justify-content: center;
  overflow-x: auto;
  --ansi-scale: clamp(1, calc(0.85 + 0.00035 * 100vw), 1.35);
  transform: scale(var(--ansi-scale));
  transform-origin: top center;
}

.ref-about-pre {
  margin: 0;
  white-space: pre;
  font-family: 'Web437 IBM VGA 9x16', 'Web437 IBM VGA 8x14 2x',
    'Web437 IBM VGA 8x14', ui-monospace, monospace;
  font-size: clamp(11px, 1.55vw, 20px);
  line-height: 0.99;
  letter-spacing: -0.5px;
  color: #e5e7eb;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: subpixel-antialiased;
}

.ansi-seg {
  display: inline;
}

.ansi-bright {
  filter: brightness(1.08);
}

.ansi-hue {
  display: inline;
  animation: hueCycle 20s linear infinite;
  will-change: filter;
}

.ansi-nl {
  display: block;
  height: 0;
}
</style>
