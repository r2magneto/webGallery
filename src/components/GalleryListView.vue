<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { buildPlainAnsiLines } from '../utils/ansiPlainRender.js'
import { loadRefAboutColorConfig, resolvePalette } from '../utils/refAboutColorConfig.js'
import { decodeBestEffort } from '../utils/utf8ansDecode.js'
import { scheduleResizeLenis } from '../lenisClient.js'
import { useGasPedalScroll } from '../composables/useGasPedalScroll.js'
import GalleryScrollbar from './GalleryScrollbar.vue'

const ANSI_URL = `${import.meta.env.BASE_URL || '/'}ref-about_01_BW.utf8ans`

const loadState = ref('loading')
const error = ref('')
const rawText = ref('')
const colorCfg = ref(loadRefAboutColorConfig())
const shellRef = ref(null)

const palette = computed(() => resolvePalette(colorCfg.value))
const ansiLines = computed(() => buildPlainAnsiLines(rawText.value, colorCfg.value))

const scrollbarActive = computed(
  () => loadState.value === 'idle' && !error.value && rawText.value.length > 0,
)

function isRefAboutScrollTarget(target) {
  if (!(target instanceof Element)) return false
  const shell = shellRef.value
  if (!(shell instanceof HTMLElement) || !shell.contains(target)) return false
  if (target.closest('button, a, input, textarea, select, label')) return false
  return true
}

const {
  shellCursorClass,
  onShellPointerDown,
  onShellPointerMove,
  onShellPointerLeave,
} = useGasPedalScroll({
  shellRef,
  isEnabled: () => loadState.value === 'idle' && !error.value,
  isScrollTarget: isRefAboutScrollTarget,
})

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
    nextTick(() => {
      syncRefAboutCanvasLayout()
      scheduleResizeLenis()
    })
  }
}

/** transform:scale lässt unten Leerraum — Margin zieht Layout an die sichtbare Höhe. */
function syncRefAboutCanvasLayout() {
  const canvas = shellRef.value?.querySelector('.ref-about-canvas')
  const pre = canvas?.querySelector('.ref-about-pre')
  if (!(canvas instanceof HTMLElement) || !(pre instanceof HTMLElement)) return

  const layoutH = pre.offsetHeight
  const scale = Number.parseFloat(getComputedStyle(canvas).getPropertyValue('--ansi-scale')) || 1
  if (layoutH <= 0 || scale >= 1) {
    canvas.style.marginBottom = ''
    return
  }
  canvas.style.marginBottom = `${-layoutH * (1 - scale)}px`
}

onMounted(() => {
  window.addEventListener('storage', () => {
    colorCfg.value = loadRefAboutColorConfig()
    nextTick(() => {
      syncRefAboutCanvasLayout()
      scheduleResizeLenis()
    })
  })
  window.addEventListener('resize', syncRefAboutCanvasLayout, { passive: true })
  loadArt()
})

watch([ansiLines, loadState], () => {
  nextTick(() => syncRefAboutCanvasLayout())
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncRefAboutCanvasLayout)
})
</script>

<template>
  <GalleryScrollbar :active="scrollbarActive" />
  <div
    ref="shellRef"
    class="ref-about-root ref-about-shell"
    :class="shellCursorClass"
    aria-label="References and about"
    @pointerdown="onShellPointerDown"
    @pointermove="onShellPointerMove"
    @pointerleave="onShellPointerLeave"
  >
    <div class="ref-about-wrap w-full px-[9%] pb-0 pt-[0.45rem]">
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

.ref-about-pre,
.ref-about-pre *,
.ref-about-status {
  cursor: inherit;
}

.ref-about-wrap {
  max-width: 100%;
  margin: 0 auto;
}

.ref-about-status {
  margin: 0;
  font-family: 'Web437 IBM VGA 9x16', 'Web437 IBM VGA 8x14 2x',
    'Web437 IBM VGA 8x14', ui-monospace, monospace;
  font-size: clamp(10px, 1.4vw, 18px);
  color: #aaaaaa;
}

.ref-about-status--error {
  color: #ff5555;
}

.ref-about-canvas {
  display: flex;
  justify-content: center;
  overflow-x: auto;
  overflow-y: hidden;
  --ansi-scale: clamp(0.9, calc(0.76 + 0.00032 * 100vw), 1.22);
  transform: scale(var(--ansi-scale));
  transform-origin: top center;
}

.ref-about-pre {
  margin: 0;
  white-space: pre;
  font-family: 'Web437 IBM VGA 9x16', 'Web437 IBM VGA 8x14 2x',
    'Web437 IBM VGA 8x14', ui-monospace, monospace;
  font-size: clamp(10px, 1.4vw, 18px);
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
