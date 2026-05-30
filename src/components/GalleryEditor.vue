<script setup>
import {
  reactive,
  ref,
  watch,
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from 'vue'
import { GridLayout, GridItem } from 'vue-grid-layout-v3'
import HeaderColorEditor from './HeaderColorEditor.vue'
import RefAboutColorEditor from './RefAboutColorEditor.vue'
import {
  downloadStaticLayoutJson,
  fetchGalleryLayoutItems,
  fetchManifestFilenames,
  rescanGalleryManifestOnServer,
} from '../apiConfig.js'
import {
  imagesBasePathForLayoutConfig,
  resolveGalleryImageSrc,
} from '../config/galleryPaths.js'
import {
  applyInitialGridDimensions,
  clampGridDimensions,
  colWidth,
  fitHeightForWidth,
  GRID_COL_NUM,
  needsDimensionInit,
  squareRowHeightPx,
} from '../utils/gridAspect.js'
import { createGridHostWidthObserver } from '../utils/gridHostResize.js'

const props = defineProps({
  /** Aktive JSON im public-Ordner (z. B. layout.json). */
  configPath: {
    type: String,
    default: 'layout.json',
  },
})

/** Editor-Thumbnails: nur leichte `_proxy.webp` laden; JSON behält Original-Pfade. */
function toProxySrc(src) {
  if (!src) return src
  const s = String(src)
  const pathOnly = s.split('?')[0]
  if (/_proxy\.webp$/i.test(pathOnly)) return s
  return s.replace(/(\.[^./?#]+)([?#].*)?$/i, '_proxy$1$2')
}

/** Standard-Spaltenbreite für neu gescannte Bilder */
const DEFAULT_SCAN_IMPORT_W = 12

const editorTab = ref('layout') // 'layout' | 'header' | 'refAbout'

/** Wird aus public/<configPath> geladen. */
const layout = ref([])

const gridRef = ref(null)
const gridHostRef = ref(null)
const gridHostWidth = ref(0)

const gridRowHeight = computed(() =>
  squareRowHeightPx(gridHostWidth.value || 960),
)

const gridHostWidthObserver = createGridHostWidthObserver({
  onWidthChange(w) {
    gridHostWidth.value = w
  },
})

function bindGridHostResizeObserver() {
  const el = gridHostRef.value
  if (!el) return
  gridHostWidthObserver.bind(el, el.offsetWidth)
}

/** Pro Bild-ID: naturalWidth / naturalHeight (u. a. für Resize-Lock & Scan-Import). */
const imageMetaById = reactive({})

/** (x,y) aller markierten Items beim Start eines Gruppen-Drags (id → {x,y}) */
const dragStartPositions = ref(null)
/** Welches Item die Library gerade zieht (nur für Gruppenzug relevant) */
const groupDragLeaderId = ref(null)
/** Aktives Drag-Item (auch Single-Drag) */
const activeDragId = ref(null)
/** Start-Layout (id → {x,y,w,h}) um andere Tiles während Drag einzufrieren */
const dragFreezeStartLayout = ref(null)

/** Während Drag: Layout erst bei Drop übernehmen (kein Live-Reflow der anderen Tiles) */
const isGridDragging = ref(false)
let pendingGridLayoutCommit = null
const gridLayoutMirror = ref([])
const groupDragLast = ref(null)

let gridEmitterUnsubscribe = null

/** Alt oder Strg: Seitenverhältnis beim Resize nicht erzwingen */
const resizeAspectFreeform = ref(false)

function syncResizeModifierKeys(e) {
  resizeAspectFreeform.value = Boolean(e.altKey || e.ctrlKey)
}

function clearResizeModifierKeys() {
  resizeAspectFreeform.value = false
}

const saveStatus = ref('')
let saveStatusTimer

const captionEditingId = ref(null)
const captionDraft = ref('')
const captionModalTextareaRef = ref(null)

/** Lightbox-Reihenfolge: direkte Zahleneingabe */
const orderEditingId = ref(null)
const orderDraft = ref('')
const orderInputRef = ref(null)

const captionModalItem = computed(() => {
  const id = captionEditingId.value
  if (!id) return null
  return layout.value.find((it) => it.i === id) ?? null
})

function onCaptionModalKeydown(e) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  cancelCaptionEdit()
}

async function loadLayoutFromServer() {
  const items = await fetchGalleryLayoutItems(props.configPath)
  layout.value = items.map((it) => ({
    ...it,
    selected: false,
    src: resolveGalleryImageSrc(it.src, props.configPath),
  }))
  syncGridLayoutMirror()
}

function filenameFromSrc(src) {
  if (!src) return ''
  const s = String(src)
  const withoutQuery = s.split('?')[0]
  const parts = withoutQuery.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ''
}

async function syncFolderToLayout({ statusPrefix = '', keepStatus = false } = {}) {
  if (!keepStatus) saveStatus.value = ''
  const filenames = (await fetchManifestFilenames(props.configPath)).filter(
    (n) =>
      /\.(jpe?g|png|webp)$/i.test(String(n)) &&
      // Proxy-Versionen (z.B. bild_proxy.webp) gehören nicht in den Editor/JSON.
      !/_proxy\.webp$/i.test(String(n)),
  )
  const manifestSet = new Set(filenames)

  // 1) Entfernte Dateien aus Layout entfernen
  const before = layout.value.length
  layout.value = layout.value.filter((it) => {
    const file = filenameFromSrc(it.src)
    return file && manifestSet.has(file)
  })
  const removedCount = before - layout.value.length

  // 2) Neue Dateien ans Ende anhängen (wie bisher Scan)
  const existingSrc = new Set(layout.value.map((it) => it.src))
  const usedIds = new Set(layout.value.map((it) => it.i))
  const makeId = (filename) => {
    const dot = filename.lastIndexOf('.')
    let base = dot > 0 ? filename.slice(0, dot) : filename
    if (!usedIds.has(base)) {
      usedIds.add(base)
      return base
    }
    let n = 1
    let id = `${base}-${n}`
    while (usedIds.has(id)) {
      n += 1
      id = `${base}-${n}`
    }
    usedIds.add(id)
    return id
  }

  await nextTick()
  let cw = getContainerWidth()
  if (cw <= 0) {
    await new Promise((r) => requestAnimationFrame(() => r()))
    cw = getContainerWidth()
  }
  if (cw <= 0) cw = 960

  let appendRowY =
    layout.value.length === 0 ? 0 : Math.max(...layout.value.map((it) => it.y + it.h))

  const added = []
  for (const name of filenames) {
    const src = `${imagesBasePathForLayoutConfig(props.configPath)}${name}`
    if (existingSrc.has(src)) continue
    const id = makeId(name)
    const { naturalWidth: nw, naturalHeight: nh } = await probeImageNatural(
      toProxySrc(src),
    )
    imageMetaById[id] = { naturalWidth: nw, naturalHeight: nh }
    const w = Math.max(1, Math.round(Math.min(DEFAULT_SCAN_IMPORT_W, GRID_COL_NUM)))
    const rh = squareRowHeightPx(cw)
    const h = Math.max(1, Math.round(fitHeightForWidth(w, cw, nw, nh, rh)))
    layout.value.push({
      i: id,
      x: 0,
      y: appendRowY,
      w,
      h,
      src,
      selected: false,
    })
    appendRowY += h
    existingSrc.add(src)
    added.push(name)
  }

  const lead = statusPrefix ? `${statusPrefix} ` : ''
  if (added.length === 0 && removedCount === 0) {
    saveStatus.value = lead
      ? `${statusPrefix} Layout ist bereits synchron.`
      : 'Keine Änderungen – Layout ist bereits synchron.'
  } else {
    const parts = []
    if (added.length) parts.push(`${added.length} hinzugefügt`)
    if (removedCount) parts.push(`${removedCount} entfernt`)
    saveStatus.value = `${lead}Synchronisiert: ${parts.join(', ')}.`.trim()
  }
  clearTimeout(saveStatusTimer)
  saveStatusTimer = setTimeout(() => {
    saveStatus.value = ''
  }, 3500)

  syncGridLayoutMirror()
}

function mergeIncomingGridLayout(incoming) {
  const byId = new Map((incoming || []).map((it) => [it.i, it]))
  const used = new Set()

  const merged = layout.value.map((cur) => {
    const nextPos = byId.get(cur.i)
    if (!nextPos) return cur
    used.add(cur.i)
    return { ...cur, ...nextPos }
  })

  for (const it of incoming || []) {
    if (used.has(it.i)) continue
    merged.push({ ...it })
  }

  return merged
}

function syncGridLayoutMirror() {
  if (isGridDragging.value) return
  gridLayoutMirror.value = layout.value.map((it) => ({ ...it }))
}

function onGridLayoutUpdate(nextLayout) {
  if (isGridDragging.value) {
    pendingGridLayoutCommit = nextLayout
    const freeze = dragFreezeStartLayout.value
    const dragId = activeDragId.value
    if (freeze && dragId) {
      const frozen = (nextLayout || []).map((it) => {
        if (it.i === dragId) return { ...it }
        const start = freeze[it.i]
        if (!start) return { ...it }
        return { ...it, ...start }
      })
      gridLayoutMirror.value = mergeIncomingGridLayout(frozen)
    }
    return
  }
  layout.value = mergeIncomingGridLayout(nextLayout)
  gridLayoutMirror.value = layout.value.map((it) => ({ ...it }))
}

/** vue-grid-layout-v3 feuert kein @drag nach außen; dragEvent (dragstart/dragmove/dragend) kommt über den Layout-Emitter. */
function onGridDragEvent(payload) {
  const [eventName, id, gx, gy] = payload || []
  if (eventName === 'dragstart') {
    isGridDragging.value = true
    activeDragId.value = id
    const startsAll = {}
    for (const it of layout.value) {
      startsAll[it.i] = { x: it.x, y: it.y, w: it.w, h: it.h }
    }
    dragFreezeStartLayout.value = startsAll
    const arr = layout.value
    const leader = arr.find((it) => it.i === id)
    if (!leader?.selected) {
      dragStartPositions.value = null
      groupDragLeaderId.value = null
      groupDragLast.value = null
      return
    }
    const selected = arr.filter((it) => it.selected)
    if (selected.length < 2) {
      dragStartPositions.value = null
      groupDragLeaderId.value = null
      groupDragLast.value = null
      return
    }
    const starts = {}
    for (const it of selected) {
      const cur = arr.find((x) => x.i === it.i)
      if (cur) starts[it.i] = { x: cur.x, y: cur.y }
    }
    dragStartPositions.value = starts
    groupDragLeaderId.value = id
    groupDragLast.value = { id, gx, gy }
    return
  }

  if (eventName === 'dragend') {
    isGridDragging.value = false
    if (pendingGridLayoutCommit) {
      layout.value = mergeIncomingGridLayout(pendingGridLayoutCommit)
      pendingGridLayoutCommit = null
    }

    // Gruppen-Drag: "Mitläufer" erst beim Drop versetzen (keine Live-Updates).
    if (
      dragStartPositions.value &&
      groupDragLeaderId.value &&
      groupDragLast.value?.id === groupDragLeaderId.value
    ) {
      const starts = dragStartPositions.value
      const leaderId = groupDragLeaderId.value
      const leaderStart = starts[leaderId]
      const last = groupDragLast.value
      if (leaderStart && last) {
        const dx = last.gx - leaderStart.x
        const dy = last.gy - leaderStart.y
        if (dx !== 0 || dy !== 0) {
          const arr = layout.value
          for (const itemId of Object.keys(starts)) {
            if (itemId === leaderId) continue
            const pos0 = starts[itemId]
            const idx = arr.findIndex((e) => e.i === itemId)
            if (idx === -1) continue
            const cur = arr[idx]
            let nx = pos0.x + dx
            let ny = pos0.y + dy
            nx = Math.max(0, Math.min(nx, GRID_COL_NUM - cur.w))
            ny = Math.max(0, ny)
            arr.splice(idx, 1, { ...cur, x: nx, y: ny })
          }
        }
      }
    }

    syncGridLayoutMirror()
    dragStartPositions.value = null
    groupDragLeaderId.value = null
    groupDragLast.value = null
    activeDragId.value = null
    dragFreezeStartLayout.value = null
    return
  }

  if (eventName !== 'dragmove') return
  if (!dragStartPositions.value || groupDragLeaderId.value !== id) return

  // Keine Live-Verschiebung der "anderen" Tiles; nur merken, wohin der Leader ging.
  groupDragLast.value = { id, gx, gy }
}

/** Aspect-Lock beim Resize (internes resizeEvent wie beim Drag über den Layout-Emitter). */
function onGridResizeEvent(payload) {
  const [eventName, id, , , h, w] = payload || []
  if (eventName !== 'resizemove' && eventName !== 'resizeend') return
  if (resizeAspectFreeform.value) return

  const cw = getContainerWidth()
  if (cw <= 0) return

  const meta = imageMetaById[id]
  const nw = meta?.naturalWidth
  const nh = meta?.naturalHeight
  if (!nw || !nh) return

  const wGrid = Math.max(1, Math.round(Number(w)))
  const lockedH = Math.max(
    1,
    Math.round(fitHeightForWidth(wGrid, cw, nw, nh)),
  )

  const arr = layout.value
  const idx = arr.findIndex((it) => it.i === id)
  if (idx === -1) return
  const cur = arr[idx]
  if (cur.w === wGrid && cur.h === lockedH) return

  const next = { ...cur, w: wGrid, h: lockedH }
  clampGridDimensions(next)
  arr.splice(idx, 1, next)
}

function subscribeGridEmitters() {
  const em = gridRef.value?.emitter
  if (!em) return
  gridEmitterUnsubscribe?.()
  em.on('dragEvent', onGridDragEvent)
  em.on('resizeEvent', onGridResizeEvent)
  gridEmitterUnsubscribe = () => {
    em.off('dragEvent', onGridDragEvent)
    em.off('resizeEvent', onGridResizeEvent)
    gridEmitterUnsubscribe = null
  }
}

onMounted(async () => {
  window.addEventListener('keydown', syncResizeModifierKeys)
  window.addEventListener('keyup', syncResizeModifierKeys)
  window.addEventListener('blur', clearResizeModifierKeys)

  await loadLayoutFromServer()
  await syncFolderToLayout()
  await nextTick()
  bindGridHostResizeObserver()
  subscribeGridEmitters()
})

watch(
  () => props.configPath,
  async () => {
    await loadLayoutFromServer()
    await syncFolderToLayout()
    await nextTick()
    bindGridHostResizeObserver()
    subscribeGridEmitters()
    syncAutoDimensions()
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', syncResizeModifierKeys)
  window.removeEventListener('keyup', syncResizeModifierKeys)
  window.removeEventListener('blur', clearResizeModifierKeys)
  window.removeEventListener('keydown', onCaptionModalKeydown, true)
  gridEmitterUnsubscribe?.()
  gridHostWidthObserver.disconnect()
})

function layoutPayload() {
  return layout.value.map((it) => {
    const { x, y, w, h, i, src, caption } = it
    const o = {
      i,
      x,
      y,
      w,
      h,
      src: resolveGalleryImageSrc(src, props.configPath),
    }
    const c = typeof caption === 'string' && caption.trim()
    if (c) o.caption = caption.trim()
    return o
  })
}

function layoutIndexForItem(item) {
  return layout.value.findIndex((it) => it.i === item?.i)
}

function layoutOrderLabel(item) {
  const idx = layoutIndexForItem(item)
  return idx === -1 ? '—' : String(idx + 1)
}

function canMoveLayoutEarlier(item) {
  return layoutIndexForItem(item) > 0
}

function canMoveLayoutLater(item) {
  const idx = layoutIndexForItem(item)
  return idx >= 0 && idx < layout.value.length - 1
}

function swapLayoutWithNeighbor(item, direction) {
  const idx = layoutIndexForItem(item)
  if (idx === -1) return
  const next = idx + direction
  if (next < 0 || next >= layout.value.length) return
  const arr = layout.value
  ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
  syncGridLayoutMirror()
}

function onMoveLayoutEarlier(item) {
  swapLayoutWithNeighbor(item, -1)
}

function onMoveLayoutLater(item) {
  swapLayoutWithNeighbor(item, 1)
}

function setLayoutOrder(item, newOrderOneBased) {
  const from = layoutIndexForItem(item)
  if (from === -1) return
  const n = layout.value.length
  if (n === 0) return
  let to = Math.round(Number(newOrderOneBased))
  if (!Number.isFinite(to)) return
  to = Math.max(1, Math.min(n, to)) - 1
  if (to === from) return
  const arr = layout.value
  const [removed] = arr.splice(from, 1)
  arr.splice(to, 0, removed)
  syncGridLayoutMirror()
}

function startOrderEdit(item) {
  const id = item?.i
  if (!id) return
  orderEditingId.value = id
  orderDraft.value = layoutOrderLabel(item)
  nextTick(() => {
    const el = orderInputRef.value
    el?.focus()
    el?.select()
  })
}

function cancelOrderEdit() {
  orderEditingId.value = null
  orderDraft.value = ''
}

function commitOrderEdit(item) {
  if (orderEditingId.value !== item?.i) return
  const raw = String(orderDraft.value).trim()
  const num = parseInt(raw, 10)
  if (!raw || !Number.isFinite(num)) {
    cancelOrderEdit()
    return
  }
  setLayoutOrder(item, num)
  cancelOrderEdit()
}

function onOrderInputKeydown(item, e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitOrderEdit(item)
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelOrderEdit()
  }
}

function openCaptionEditor(item) {
  const id = item?.i
  if (!id) return
  cancelOrderEdit()
  captionEditingId.value = id
  const cur = layout.value.find((it) => it.i === id)
  captionDraft.value = cur?.caption ? String(cur.caption) : ''
}

function cancelCaptionEdit() {
  captionEditingId.value = null
  captionDraft.value = ''
}

function confirmCaptionEdit() {
  const id = captionEditingId.value
  if (!id) return
  const next = captionDraft.value.trim()
  const has = Boolean(next)
  const arr = layout.value
  const idx = arr.findIndex((e) => e.i === id)
  if (idx === -1) return
  const cur = arr[idx]
  const updated = { ...cur }
  if (has) updated.caption = next
  else delete updated.caption
  arr.splice(idx, 1, updated)
  syncGridLayoutMirror()
  cancelCaptionEdit()
}

function saveLayout() {
  saveStatus.value = ''
  try {
    downloadStaticLayoutJson(props.configPath, layoutPayload())
    saveStatus.value = `${props.configPath} heruntergeladen – Datei nach public/ legen (bestehende Datei ersetzen).`
    clearTimeout(saveStatusTimer)
    saveStatusTimer = setTimeout(() => {
      saveStatus.value = ''
    }, 5000)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Download fehlgeschlagen.')
  }
}

function probeImageNatural(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const nw = img.naturalWidth > 0 ? img.naturalWidth : 1
      const nh = img.naturalHeight > 0 ? img.naturalHeight : 1
      resolve({ naturalWidth: nw, naturalHeight: nh })
    }
    img.onerror = () => resolve({ naturalWidth: 1, naturalHeight: 1 })
    img.src = src
  })
}

async function scanFolder() {
  saveStatus.value = 'Scanne Bilderordner auf dem Server…'
  try {
    const scan = await rescanGalleryManifestOnServer(props.configPath)
    const prefix = scan
      ? `Manifest auf dem Server neu geschrieben (${scan.count} Datei${scan.count === 1 ? '' : 'en'}).`
      : 'PHP-Scan nicht erreichbar — lese vorhandenes manifest.json (lokal: npm run dev oder server).'
    await syncFolderToLayout({ statusPrefix: prefix })
  } catch (e) {
    saveStatus.value = ''
    alert(e instanceof Error ? e.message : 'Scan fehlgeschlagen.')
  }
}

function getContainerWidth() {
  return gridRef.value?.el?.offsetWidth ?? 0
}

function loadImageNatural(item) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      })
    }
    const proxySrc = toProxySrc(item.src)
    img.onerror = () => reject(new Error(`load failed: ${proxySrc}`))
    img.src = proxySrc
  })
}

async function ensureImageMeta(item) {
  const id = item.i
  const existing = imageMetaById[id]
  if (existing?.naturalWidth > 0 && existing?.naturalHeight > 0) {
    item.naturalWidth = existing.naturalWidth
    item.naturalHeight = existing.naturalHeight
    return
  }

  try {
    const { naturalWidth, naturalHeight } = await loadImageNatural(item)
    const nh = naturalHeight > 0 ? naturalHeight : 1
    const nw = naturalWidth > 0 ? naturalWidth : 1
    imageMetaById[id] = {
      naturalWidth: nw,
      naturalHeight: nh,
    }
    item.naturalWidth = nw
    item.naturalHeight = nh
  } catch {
    imageMetaById[id] = {
      naturalWidth: 1,
      naturalHeight: 1,
    }
    item.naturalWidth = 1
    item.naturalHeight = 1
  }
}

async function syncAutoDimensions() {
  await nextTick()
  const cw = getContainerWidth()
  if (cw <= 0) return
  for (const item of layout.value) {
    await ensureImageMeta(item)
    if (needsDimensionInit(item)) {
      applyInitialGridDimensions(item, cw, squareRowHeightPx(cw))
      patchLayoutItem(item.i, { w: item.w, h: item.h })
    }
  }
}

/** Ersetzt das Item im Array, damit Vue & Grid die Änderung sicher sehen */
function patchLayoutItem(id, updates) {
  const arr = layout.value
  const idx = arr.findIndex((it) => it.i === id)
  if (idx === -1) return
  const next = { ...arr[idx], ...updates }
  arr.splice(idx, 1, next)
  syncGridLayoutMirror()
}

function onLayoutReady() {
  bindGridHostResizeObserver()
  subscribeGridEmitters()
  syncAutoDimensions()
  syncGridLayoutMirror()
}

watch(gridHostRef, (el) => {
  if (el) nextTick(() => bindGridHostResizeObserver())
})

watch(
  () => layout.value.length,
  () => {
    syncAutoDimensions()
    syncGridLayoutMirror()
  },
)

watch(captionEditingId, (id) => {
  if (id) {
    window.addEventListener('keydown', onCaptionModalKeydown, true)
    nextTick(() => captionModalTextareaRef.value?.focus())
  } else {
    window.removeEventListener('keydown', onCaptionModalKeydown, true)
  }
})

function clearSelection() {
  layout.value = layout.value.map((it) =>
    it.selected ? { ...it, selected: false } : it,
  )
  syncGridLayoutMirror()
}

function onGridSurfaceClick(e) {
  const t = e.target
  if (t?.classList?.contains('vue-grid-layout')) {
    cancelCaptionEdit()
    cancelOrderEdit()
    clearSelection()
    return
  }
  if (t === gridHostRef.value) {
    cancelCaptionEdit()
    cancelOrderEdit()
    clearSelection()
  }
}

function onItemClick(item, e) {
  if (!e.shiftKey) return
  const idx = layout.value.findIndex((it) => it.i === item.i)
  if (idx === -1) return
  const cur = layout.value[idx]
  patchLayoutItem(item.i, { selected: !cur.selected })
  syncGridLayoutMirror()
}

async function applyResetAspectForId(id) {
  const arr = layout.value
  const idx = arr.findIndex((it) => it.i === id)
  if (idx === -1) return
  const cur = arr[idx]
  await ensureImageMeta(cur)

  const meta = imageMetaById[id]
  const nw = meta?.naturalWidth
  const nh = meta?.naturalHeight
  if (nw == null || nh == null || nh <= 0 || nw <= 0) return

  const ratio = nw / nh
  const w = Number(cur.w)
  if (!Number.isFinite(w) || w <= 0) return

  const containerW = getContainerWidth()
  if (containerW <= 0) return

  const colW = colWidth(containerW)
  const rowH = squareRowHeightPx(containerW)
  if (colW <= 0 || rowH <= 0) return

  const newH = Math.max(
    1,
    Math.round((w / ratio) * (colW / rowH)),
  )
  const next = { ...cur, h: newH }
  clampGridDimensions(next)
  arr.splice(idx, 1, next)
  syncGridLayoutMirror()
}

async function onResetAspect(item) {
  const selectedIds = layout.value.filter((it) => it.selected).map((it) => it.i)
  const ids = selectedIds.length > 0 ? selectedIds : [item.i]
  for (const id of ids) {
    await applyResetAspectForId(id)
  }
}

</script>

<template>
  <div
    class="gallery-editor flex min-h-svh flex-col bg-slate-900 text-slate-100"
  >
    <header
      class="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-white/10 bg-slate-900/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-slate-900/80"
    >
      <nav class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide ring-1 ring-white/15"
          :class="editorTab === 'layout' ? 'bg-emerald-600 text-white ring-emerald-400/40' : 'bg-slate-800/40 text-slate-200 hover:bg-slate-700/40'"
          @click="editorTab = 'layout'"
        >
          Layout
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide ring-1 ring-white/15"
          :class="editorTab === 'header' ? 'bg-emerald-600 text-white ring-emerald-400/40' : 'bg-slate-800/40 text-slate-200 hover:bg-slate-700/40'"
          @click="editorTab = 'header'"
        >
          Header
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide ring-1 ring-white/15"
          :class="editorTab === 'refAbout' ? 'bg-emerald-600 text-white ring-emerald-400/40' : 'bg-slate-800/40 text-slate-200 hover:bg-slate-700/40'"
          @click="editorTab = 'refAbout'"
        >
          References / About
        </button>
      </nav>
      <span class="text-xs text-zinc-500" title="Öffentliche Layout-Datei (public/)">
        {{ configPath }}
      </span>
      <template v-if="editorTab === 'layout'">
        <button
          type="button"
          class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          @click="saveLayout"
        >
          Speichern
        </button>
        <button
          type="button"
          class="rounded-lg border border-white/20 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          @click="scanFolder"
        >
          Manifest neu einlesen
        </button>
      </template>
      <p
        v-if="saveStatus"
        class="text-sm text-emerald-400"
        role="status"
      >
        {{ saveStatus }}
      </p>
      <a
        href="https://cloud.umami.is/analytics/eu/websites"
        target="_blank"
        rel="noopener noreferrer"
        class="ml-auto rounded-lg border border-white/20 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      >
        Visitors / Statistics
      </a>
    </header>

    <main class="flex-1 p-4">
      <HeaderColorEditor v-if="editorTab === 'header'" />
      <RefAboutColorEditor v-else-if="editorTab === 'refAbout'" />
      <template v-else>
      <div
        ref="gridHostRef"
        class="editor-grid-host w-full px-[10%]"
        @click="onGridSurfaceClick"
      >
        <div class="editor-grid-bounds relative min-h-[min(70vh,800px)]">
        <GridLayout
          ref="gridRef"
          :layout="gridLayoutMirror"
          @update:layout="onGridLayoutUpdate"
          :col-num="48"
          :row-height="gridRowHeight"
          :margin="[10, 10]"
          :is-draggable="true"
          :is-resizable="true"
          :vertical-compact="false"
          :prevent-collision="true"
          :use-css-transforms="true"
          class="gallery-grid min-h-[min(70vh,800px)]"
          @layout-ready="onLayoutReady"
        >
          <GridItem
            v-for="item in gridLayoutMirror"
            :key="item.i"
            :x="item.x"
            :y="item.y"
            :w="item.w"
            :h="item.h"
            :i="item.i"
          >
            <div
              class="editor-tile-frame group absolute inset-0 box-border flex min-h-0 flex-col overflow-hidden rounded-lg"
              :class="
                item.selected
                  ? 'border-4 border-blue-500 opacity-90'
                  : 'ring-1 ring-white/15'
              "
              @click.stop="onItemClick(item, $event)"
            >
              <div class="relative min-h-0 flex-1 overflow-hidden">
                <img
                  :src="toProxySrc(item.src)"
                  :alt="item.i"
                  class="h-full w-full object-cover"
                  decoding="async"
                />
              </div>
              <div
                class="editor-order-controls pointer-events-none absolute left-1/2 top-1.5 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-md bg-slate-900/92 px-1 py-0.5 shadow-lg ring-1 ring-white/25"
                aria-label="Lightbox-Reihenfolge"
              >
                <button
                  type="button"
                  class="editor-order-btn pointer-events-auto flex h-7 w-7 items-center justify-center rounded text-base font-bold leading-none text-slate-100 opacity-0 transition-opacity hover:bg-slate-700 hover:text-white focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                  :disabled="!canMoveLayoutEarlier(item)"
                  title="In der Lightbox-Reihenfolge nach vorne"
                  aria-label="Lightbox-Reihenfolge: einen Schritt nach vorne"
                  @pointerdown.stop
                  @mousedown.stop
                  @click.stop="onMoveLayoutEarlier(item)"
                >
                  −
                </button>
                <button
                  v-if="orderEditingId !== item.i"
                  type="button"
                  class="editor-order-label pointer-events-auto min-w-[1.75rem] cursor-text rounded px-0.5 text-center text-sm font-bold tabular-nums text-yellow-400 hover:bg-slate-800/80 hover:text-yellow-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  :title="`Lightbox-Position ${layoutOrderLabel(item)} von ${layout.length} — Klicken zum Bearbeiten`"
                  :aria-label="`Lightbox-Position ${layoutOrderLabel(item)} von ${layout.length}, Zahl eingeben`"
                  @pointerdown.stop
                  @mousedown.stop
                  @click.stop="startOrderEdit(item)"
                >
                  {{ layoutOrderLabel(item) }}
                </button>
                <input
                  v-else
                  ref="orderInputRef"
                  type="number"
                  :min="1"
                  :max="layout.length"
                  inputmode="numeric"
                  class="editor-order-input pointer-events-auto"
                  :aria-label="`Neue Lightbox-Position für ${item.i}`"
                  v-model="orderDraft"
                  @keydown="onOrderInputKeydown(item, $event)"
                  @blur="commitOrderEdit(item)"
                  @click.stop
                  @pointerdown.stop
                  @mousedown.stop
                />
                <button
                  type="button"
                  class="editor-order-btn pointer-events-auto flex h-7 w-7 items-center justify-center rounded text-base font-bold leading-none text-slate-100 opacity-0 transition-opacity hover:bg-slate-700 hover:text-white focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                  :disabled="!canMoveLayoutLater(item)"
                  title="In der Lightbox-Reihenfolge nach hinten"
                  aria-label="Lightbox-Reihenfolge: einen Schritt nach hinten"
                  @pointerdown.stop
                  @mousedown.stop
                  @click.stop="onMoveLayoutLater(item)"
                >
                  +
                </button>
              </div>
              <div
                class="pointer-events-none absolute inset-0 opacity-0 outline outline-[4px] outline-yellow-400 transition-opacity duration-[2000ms] ease-out group-hover:opacity-100 group-hover:!duration-0"
                aria-hidden="true"
              />
              <div
                v-if="item.selected"
                class="pointer-events-none absolute inset-0 flex items-center justify-center bg-blue-500/25"
                aria-hidden="true"
              >
                <svg
                  class="h-10 w-10 shrink-0 text-blue-200 drop-shadow-md"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
            <button
              type="button"
              class="absolute bottom-1.5 left-1.5 z-20 flex h-8 w-8 items-center justify-center rounded-md bg-slate-900/85 text-xs font-semibold text-slate-100 opacity-0 shadow-md ring-1 ring-white/20 transition-opacity hover:bg-slate-800 hover:text-white focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 group-hover:opacity-100"
              title="Untertitel bearbeiten"
              aria-label="Untertitel bearbeiten"
              @pointerdown.stop
              @mousedown.stop
              @click.stop="openCaptionEditor(item)"
            >
              T
            </button>
            <button
              type="button"
              class="absolute right-1.5 top-1.5 z-20 flex h-8 w-8 items-center justify-center rounded-md bg-slate-900/85 text-slate-100 opacity-0 shadow-md ring-1 ring-white/20 transition-opacity hover:bg-slate-800 hover:text-white focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 group-hover:opacity-100"
              title="Seitenverhältnis zurücksetzen"
              aria-label="Seitenverhältnis zurücksetzen"
              @pointerdown.stop
              @mousedown.stop
              @click.stop="onResetAspect(item)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="h-4 w-4"
                aria-hidden="true"
              >
                <rect x="4" y="5" width="6" height="10" rx="1" />
                <rect x="14" y="9" width="6" height="10" rx="1" />
                <path d="M7 5V3M17 19v2" />
              </svg>
            </button>
          </div>
        </GridItem>
      </GridLayout>
        </div>
      </div>
      </template>
    </main>

    <Teleport to="body">
      <div
        v-if="captionEditingId && captionModalItem"
        class="caption-modal-root fixed inset-0 z-[2000] flex items-center justify-center p-4"
        role="presentation"
        @click.self="cancelCaptionEdit"
      >
        <div
          class="caption-modal-panel w-[min(500px,100%)] max-h-[min(85vh,720px)] rounded-lg border border-yellow-400/50 bg-neutral-950 p-5 shadow-2xl shadow-black/60 outline outline-1 outline-yellow-400/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="caption-modal-title"
          @click.stop
        >
          <h2
            id="caption-modal-title"
            class="mb-1 text-sm font-medium tracking-tight text-zinc-100"
          >
            Untertitel
            <span class="font-normal text-zinc-500">· {{ captionModalItem.i }}</span>
          </h2>
          <p class="mb-3 truncate text-xs text-zinc-500" :title="captionModalItem.src">
            {{ captionModalItem.src }}
          </p>
          <label class="sr-only" for="caption-modal-textarea">Untertiteltext</label>
          <textarea
            id="caption-modal-textarea"
            ref="captionModalTextareaRef"
            v-model="captionDraft"
            rows="14"
            maxlength="4000"
            class="caption-modal-textarea mb-4 w-full resize-y rounded border border-white/10 bg-black/40 px-3 py-2.5 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-yellow-400/35 focus:outline-none focus:ring-1 focus:ring-yellow-400/25"
            style="min-height: 12rem"
            placeholder="Mehrzeiliger Text (Enter für Zeilenumbruch)…"
          />
          <div class="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="rounded-md border border-white/15 bg-transparent px-4 py-2 text-sm text-zinc-400 hover:border-white/25 hover:text-zinc-100"
              @click="cancelCaptionEdit"
            >
              Abbrechen
            </button>
            <button
              type="button"
              class="rounded-md bg-yellow-500/90 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-yellow-400"
              @click="confirmCaptionEdit"
            >
              OK · Speichern
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Nutzbarer Grid-Bereich: linke/rechte Kante (entspricht px-[10%]-Innenfläche) */
.editor-grid-bounds::before,
.editor-grid-bounds::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #262626;
  box-shadow: 0 0 0 1px rgb(34 211 238 / 0.06);
  pointer-events: none;
  z-index: 5;
}

.editor-grid-bounds::before {
  left: 0;
}

.editor-grid-bounds::after {
  right: 0;
}

.editor-order-input {
  width: 2.75rem;
  height: 1.75rem;
  border-radius: 0.25rem;
  border: 1px solid rgb(250 204 21 / 0.45);
  background: rgb(15 23 42 / 0.95);
  padding: 0 0.25rem;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(250 204 21);
  -moz-appearance: textfield;
  appearance: textfield;
}

.editor-order-input:focus {
  outline: none;
  border-color: rgb(250 204 21 / 0.75);
  box-shadow: 0 0 0 2px rgb(52 211 153 / 0.35);
}

.editor-order-input::-webkit-outer-spin-button,
.editor-order-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.gallery-grid :deep(.vue-grid-layout) {
  min-height: 200px;
}

.caption-modal-root {
  background: rgb(0 0 0 / 0.52);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
</style>

<style>
/* Placeholder beim Ziehen: stärker als die Library-Defaults (opacity 0.2 / rot) */
.gallery-editor .vue-grid-item.vue-grid-placeholder {
  background: rgba(45, 212, 191, 0.28) !important;
  opacity: 1 !important;
  box-shadow: inset 0 0 0 2px rgba(45, 212, 191, 0.45);
  border-radius: 0.5rem;
}
</style>
