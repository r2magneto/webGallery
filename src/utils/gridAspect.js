export const GRID_COL_NUM = 48
/** Fallback, wenn die Containerbreite noch nicht gemessen ist */
export const GRID_ROW_HEIGHT = 15
export const GRID_MARGIN = [10, 10]

/** Zusätzliche Gitterzeilen, wenn eine Caption gesetzt ist (Platz für 1–3 Textzeilen). */
export const CAPTION_GRID_ROW_RESERVE = 2

export function colWidth(containerWidth) {
  const mx = GRID_MARGIN[0]
  return (containerWidth - mx * (GRID_COL_NUM + 1)) / GRID_COL_NUM
}

/**
 * Zeilenhöhe = Spaltenbreite → eine Raster-Zelle (1×1) ist quadratisch;
 * vue-grid-layout nutzt dieselbe Formel für colWidth.
 */
export function squareRowHeightPx(containerWidth) {
  if (containerWidth == null || containerWidth <= 0) return GRID_ROW_HEIGHT
  return Math.max(4, colWidth(containerWidth))
}

export function itemWidthPx(w, containerWidth) {
  if (w < 1) return 0
  const mx = GRID_MARGIN[0]
  const cw = colWidth(containerWidth)
  return cw * w + Math.max(0, w - 1) * mx
}

export function itemHeightPx(h, rowHeight = GRID_ROW_HEIGHT) {
  if (h < 1) return 0
  const my = GRID_MARGIN[1]
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
