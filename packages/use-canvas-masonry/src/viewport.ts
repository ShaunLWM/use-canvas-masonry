import type { CanvasItem, ContainerSize, TileLayout, Viewport } from './types'

type Rect = { left: number; top: number; right: number; bottom: number }

function getVisibleRect(viewport: Viewport, container: ContainerSize, overscan: number): Rect {
  // The canvas transform is: translate(viewport.x, viewport.y) scale(viewport.zoom)
  // A point in canvas space maps to screen as: screen = canvas * zoom + pan
  // So visible canvas rect = (screen - pan) / zoom
  const { x, y, zoom } = viewport
  const left = (-x - overscan) / zoom
  const top = (-y - overscan) / zoom
  const right = (-x + container.width + overscan) / zoom
  const bottom = (-y + container.height + overscan) / zoom
  return { left, top, right, bottom }
}

function tileHitsRect<T extends CanvasItem>(
  tile: TileLayout<T>,
  ox: number,
  oy: number,
  rect: Rect,
): boolean {
  const tx = tile.x + ox
  const ty = tile.y + oy
  return (
    tx < rect.right &&
    tx + tile.width > rect.left &&
    ty < rect.bottom &&
    ty + tile.height > rect.top
  )
}

export function getVisibleTiles<T extends CanvasItem>(
  allTiles: TileLayout<T>[],
  viewport: Viewport,
  container: ContainerSize,
  overscan: number,
  totalSize?: ContainerSize,
  wrap?: boolean,
  wrapY?: boolean,
  /** Per-column Y repeat periods keyed by tile.x column coordinate. Used for seamless Y wrapping. */
  columnPeriods?: Map<number, number>,
): TileLayout<T>[] {
  if (allTiles.length === 0 || container.width === 0 || container.height === 0) return []
  const rect = getVisibleRect(viewport, container, overscan)

  if (!wrap || !totalSize || totalSize.width === 0) {
    return allTiles.filter((tile) => tileHitsRect(tile, 0, 0, rect))
  }

  const { width: tw } = totalSize

  // Horizontal: which X-copies overlap the visible rect
  const firstKx = Math.floor(rect.left / tw)
  const lastKx = Math.floor(rect.right / tw)

  const result: TileLayout<T>[] = []

  for (let kx = firstKx; kx <= lastKx; kx++) {
    const ox = kx * tw

    if (!wrapY || !columnPeriods) {
      // No Y wrapping — single Y pass
      for (const tile of allTiles) {
        if (tileHitsRect(tile, ox, 0, rect)) {
          result.push({ ...tile, x: tile.x + ox, wrapKey: `${tile.index}:${kx}:0` })
        }
      }
      continue
    }

    // Y wrapping with per-column periods — each column tiles independently
    for (const tile of allTiles) {
      const colPeriod = columnPeriods.get(tile.x) ?? 0
      if (colPeriod <= 0) {
        if (tileHitsRect(tile, ox, 0, rect)) {
          result.push({ ...tile, x: tile.x + ox, wrapKey: `${tile.index}:${kx}:0` })
        }
        continue
      }
      const firstKy = Math.floor(rect.top / colPeriod)
      const lastKy = Math.floor(rect.bottom / colPeriod)
      for (let ky = firstKy; ky <= lastKy; ky++) {
        const oy = ky * colPeriod
        if (tileHitsRect(tile, ox, oy, rect)) {
          result.push({
            ...tile,
            x: tile.x + ox,
            y: tile.y + oy,
            wrapKey: `${tile.index}:${kx}:${ky}`,
          })
        }
      }
    }
  }

  return result
}
