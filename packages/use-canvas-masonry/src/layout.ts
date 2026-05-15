import type { CanvasItem, LayoutMode, TileLayout } from './types'

type LayoutOptions = {
  columnWidth: number
  gap: number
  layout: LayoutMode
}

export type LayoutResult<T extends CanvasItem> = {
  tiles: TileLayout<T>[]
  totalWidth: number
  totalHeight: number
  /** Y height of each column (index = column number). Used for per-column seamless Y wrapping. */
  columnHeights: number[]
}

export function computeLayout<T extends CanvasItem>(
  items: T[],
  options: LayoutOptions,
): LayoutResult<T> {
  switch (options.layout) {
    case 'grid':
      return computeGridLayout(items, options)
    default:
      return computeMasonryLayout(items, options)
  }
}

function computeMasonryLayout<T extends CanvasItem>(
  items: T[],
  { columnWidth, gap }: LayoutOptions,
): LayoutResult<T> {
  if (items.length === 0) return { tiles: [], totalWidth: 0, totalHeight: 0, columnHeights: [] }

  // Use a generous column count — the canvas is infinite horizontally,
  // so we pick a number that looks balanced and fills a wide viewport.
  const columnCount = Math.max(1, Math.round(Math.sqrt(items.length) * 1.4))
  const colHeights = new Array<number>(columnCount).fill(0)

  const tiles: TileLayout<T>[] = items.map((item, index) => {
    // Pick the shortest column — loop is faster than Math.min(...spread)
    let col = 0
    for (let i = 1; i < columnCount; i++) {
      if (colHeights[i] < colHeights[col]) col = i
    }

    const h = item.width > 0 ? (columnWidth / item.width) * item.height : columnWidth
    const x = col * (columnWidth + gap)
    const y = colHeights[col]

    colHeights[col] += h + gap

    return { item, index, x, y, width: columnWidth, height: h }
  })

  const totalWidth = columnCount * (columnWidth + gap) - gap
  let totalHeight = 0
  for (let i = 0; i < columnCount; i++) {
    if (colHeights[i] > totalHeight) totalHeight = colHeights[i]
  }
  totalHeight -= gap

  // Per-column Y repeat periods for seamless wrapping:
  // colHeights[i] already includes the trailing gap so placing the next copy there gives
  // exactly `gap` px between the last tile and the first tile of the next copy.
  const columnHeights = [...colHeights]

  return { tiles, totalWidth, totalHeight, columnHeights }
}

function computeGridLayout<T extends CanvasItem>(
  items: T[],
  { columnWidth, gap }: LayoutOptions,
): LayoutResult<T> {
  if (items.length === 0) return { tiles: [], totalWidth: 0, totalHeight: 0, columnHeights: [] }

  const columnCount = Math.max(1, Math.round(Math.sqrt(items.length) * 1.4))
  const cellSize = columnWidth

  const tiles: TileLayout<T>[] = items.map((item, index) => {
    const col = index % columnCount
    const row = Math.floor(index / columnCount)
    return {
      item,
      index,
      x: col * (cellSize + gap),
      y: row * (cellSize + gap),
      width: cellSize,
      height: cellSize,
    }
  })

  const rows = Math.ceil(items.length / columnCount)
  const totalWidth = columnCount * (cellSize + gap) - gap
  const totalHeight = rows * (cellSize + gap) - gap
  // Grid: all columns identical height, period = totalHeight + gap
  const period = totalHeight + gap
  const columnHeights = new Array<number>(columnCount).fill(period)

  return { tiles, totalWidth, totalHeight, columnHeights }
}
