export const GRID_COL_NUM = 48
/** Fallback, wenn die Containerbreite noch nicht gemessen ist */
export const GRID_ROW_HEIGHT = 15
export const GRID_MARGIN = [10, 10]

/** Zusätzliche Gitterzeilen, wenn eine Caption gesetzt ist (Platz für 1–3 Textzeilen). */
export const CAPTION_GRID_ROW_RESERVE = 2

export function colWidth(containerWidth, currentMx) {
  const mx = currentMx !== undefined ? currentMx : GRID_MARGIN[0]
  return (containerWidth - mx * (GRID_COL_NUM + 1)) / GRID_COL_NUM
}

/**
 * Zeilenhöhe = Spaltenbreite → eine Raster-Zelle (1×1) ist quadratisch;
 * vue-grid-layout nutzt dieselbe Formel für colWidth (gleiches mx wie :margin).
 */
export function squareRowHeightPx(containerWidth, currentMx) {
  if (containerWidth == null || containerWidth <= 0) return GRID_ROW_HEIGHT
  return Math.max(4, colWidth(containerWidth, currentMx))
}

export function itemWidthPx(w, containerWidth, currentMx) {
  if (w < 1) return 0
  const mx = currentMx !== undefined ? currentMx : GRID_MARGIN[0]
  const cw = colWidth(containerWidth, mx)
  return cw * w + Math.max(0, w - 1) * mx
}

export function itemHeightPx(h, rowHeight = GRID_ROW_HEIGHT, currentMy) {
  if (h < 1) return 0
  const my = currentMy !== undefined ? currentMy : GRID_MARGIN[1]
  return rowHeight * h + Math.max(0, h - 1) * my
}

export function gridHFromTargetHeightPx(targetPxH, rowHeight = GRID_ROW_HEIGHT) {
  const my = GRID_MARGIN[1]
  const rh = rowHeight
  return Math.max(1, Math.round((targetPxH + my) / (rh + my)))
}

export function gridWFromTargetWidthPx(targetPxW, containerWidth) {
  const mx = GRID_MARGIN[0]
  const cw = colWidth(containerWidth)
  return Math.max(1, Math.round((targetPxW + mx) / (cw + mx)))
}

export function fitHeightForWidth(
  w,
  containerWidth,
  naturalW,
  naturalH,
  rowHeight,
) {
  if (!naturalW || !naturalH || !containerWidth) return 1
  const rh = rowHeight ?? squareRowHeightPx(containerWidth)
  const pxW = itemWidthPx(w, containerWidth)
  const targetPxH = pxW * (naturalH / naturalW)
  return gridHFromTargetHeightPx(targetPxH, rh)
}

export function fitWidthForHeight(
  h,
  containerWidth,
  naturalW,
  naturalH,
  rowHeight,
) {
  if (!naturalW || !naturalH || !containerWidth) return 1
  const rh = rowHeight ?? squareRowHeightPx(containerWidth)
  const pxH = itemHeightPx(h, rh)
  const targetPxW = pxH * (naturalW / naturalH)
  return gridWFromTargetWidthPx(targetPxW, containerWidth)
}

export function clampGridDimensions(item) {
  const x = item.x ?? 0
  item.w = Math.max(1, Math.min(item.w, GRID_COL_NUM - x))
  item.h = Math.max(1, item.h)
}

export function needsDimensionInit(item) {
  const w = item.w
  const h = item.h
  const badW = w == null || Number(w) <= 0
  const badH = h == null || Number(h) <= 0
  return badW || badH
}

/**
 * CSS aspect-ratio für Thumbnail-Container (aus Raster w×h, vor Bild-Load stabil).
 */
export function tileContainerAspectStyle(
  item,
  containerWidth,
  rowHeight,
  currentMargin,
) {
  const gw = item?.w
  const gh = item?.h
  if (!gw || !gh || !containerWidth || containerWidth <= 0) return {}
  const mx = currentMargin?.[0] ?? GRID_MARGIN[0]
  const my = currentMargin?.[1] ?? GRID_MARGIN[1]
  const rh = rowHeight ?? squareRowHeightPx(containerWidth, mx)
  const pxW = itemWidthPx(gw, containerWidth, mx)
  const pxH = itemHeightPx(gh, rh, my)
  if (pxW <= 0 || pxH <= 0) return {}
  return { aspectRatio: `${pxW} / ${pxH}` }
}

export function applyInitialGridDimensions(item, containerWidth, rowHeight) {
  const nw = item.naturalWidth
  const nh = item.naturalHeight
  if (!nw || !nh || !containerWidth) return

  const rh = rowHeight ?? squareRowHeightPx(containerWidth)

  const hasW = item.w != null && Number(item.w) > 0
  const hasH = item.h != null && Number(item.h) > 0

  if (!hasW && !hasH) {
    const x = item.x ?? 0
    item.w = Math.max(1, Math.min(8, GRID_COL_NUM - x))
    item.h = fitHeightForWidth(item.w, containerWidth, nw, nh, rh)
  } else if (!hasW && hasH) {
    item.w = fitWidthForHeight(item.h, containerWidth, nw, nh, rh)
  } else if (hasW && !hasH) {
    item.h = fitHeightForWidth(item.w, containerWidth, nw, nh, rh)
  }

  clampGridDimensions(item)
}
