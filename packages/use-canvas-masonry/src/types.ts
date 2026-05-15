import type { CSSProperties, RefObject } from 'react'

export type CanvasItem = { width: number; height: number }

export type LayoutMode = 'masonry' | 'grid'

export type TileLayout<T extends CanvasItem> = {
  item: T
  index: number
  x: number
  y: number
  width: number
  height: number
  /** Unique React key including wrap offset. Set when wrap is enabled; use as <Tile key={tile.wrapKey ?? tile.index}> */
  wrapKey?: string
}

export type Viewport = {
  x: number
  y: number
  zoom: number
}

export type ContainerSize = {
  width: number
  height: number
}

export type UseCanvasMasonryOptions<T extends CanvasItem> = {
  items: T[]
  /** Fixed column width in px. Default: 300 */
  columnWidth?: number
  /** Gap between columns and rows in px. Default: 30 */
  gap?: number
  /** Layout algorithm. Default: 'masonry' */
  layout?: LayoutMode
  /** Minimum zoom level. Default: 0.1 */
  minZoom?: number
  /** Maximum zoom level. Default: 3 */
  maxZoom?: number
  /** Extra px rendered outside viewport. Default: 200 */
  overscan?: number
  /** Starting viewport position and zoom */
  initialViewport?: Partial<Viewport>
  /** Enable infinite horizontal (X-axis) wrap-around. Default: false */
  wrap?: boolean
  /** Also wrap vertically (Y-axis). Only works cleanly with grid layout. Default: false */
  wrapY?: boolean
  /** Called when a tile is tapped (pointer displacement < 5px). Not fired after drags. */
  onItemClick?: (item: T, tile: TileLayout<T>, event: PointerEvent) => void
}

export type UseCanvasMasonryReturn<T extends CanvasItem> = {
  /** Attach to the fixed outer container (overflow: hidden) */
  containerRef: RefObject<HTMLDivElement>
  /** Attach to the inner transform layer */
  transformRef: RefObject<HTMLDivElement>
  /** Spread onto the outer container div */
  containerProps: {
    style: CSSProperties
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void
  }
  /** Spread onto the inner transform div */
  transformProps: {
    style: CSSProperties
  }
  /** Call with each tile to get its style props */
  tileProps: (tile: TileLayout<T>) => { style: CSSProperties }
  /** Only items currently visible in the viewport — render these */
  visibleTiles: TileLayout<T>[]
  /** All computed tile positions */
  allTiles: TileLayout<T>[]
  /** Current viewport state (read-only snapshot, updates on render) */
  viewport: Viewport
  /** Total canvas dimensions */
  totalSize: ContainerSize
  /** Pan to an absolute canvas position */
  panTo: (x: number, y: number) => void
  /** Zoom to a level, optionally anchored to a screen point */
  zoomTo: (zoom: number, center?: { x: number; y: number }) => void
  /** Fit all content into the viewport */
  fitToView: () => void
}
