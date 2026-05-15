import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'

import { computeLayout } from './layout'
import type {
  CanvasItem,
  ContainerSize,
  TileLayout,
  UseCanvasMasonryOptions,
  UseCanvasMasonryReturn,
  Viewport,
} from './types'
import { getVisibleTiles } from './viewport'

// Both objects are static — hoisted so they're not recreated on every render
const CONTAINER_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  touchAction: 'none',
  userSelect: 'none',
  cursor: 'grab', // toggled imperatively to 'grabbing' in pointer handlers
}

const TRANSFORM_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  willChange: 'transform',
  transformOrigin: '0 0',
  transformStyle: 'preserve-3d',
}

const DEFAULTS = {
  columnWidth: 300,
  gap: 30,
  layout: 'masonry' as const,
  minZoom: 0.5,
  maxZoom: 3,
  overscan: 200,
}

// Inertia config
const FRICTION = 0.88
const MIN_VELOCITY = 0.5

// Normalize viewport X so it stays within one canvas period.
// Y is intentionally left unbounded — per-column tiling handles visual Y wrapping seamlessly,
// and normalizing Y with a single period would create a visible seam when column heights differ.
function normalizeViewport(vp: Viewport, totalWidth: number): void {
  const periodX = totalWidth * vp.zoom
  if (periodX > 0) vp.x = ((vp.x % periodX) - periodX) % periodX
}

export function useCanvasMasonry<T extends CanvasItem>({
  items,
  columnWidth = DEFAULTS.columnWidth,
  gap = DEFAULTS.gap,
  layout = DEFAULTS.layout,
  minZoom = DEFAULTS.minZoom,
  maxZoom = DEFAULTS.maxZoom,
  overscan = DEFAULTS.overscan,
  initialViewport,
  wrap = false,
  wrapY = true,
  onItemClick,
}: UseCanvasMasonryOptions<T>): UseCanvasMasonryReturn<T> {
  const containerRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<HTMLDivElement>(null)

  // Viewport stored in refs — never triggers React re-renders during pan
  const vpRef = useRef<Viewport>({
    x: initialViewport?.x ?? 0,
    y: initialViewport?.y ?? 0,
    zoom: initialViewport?.zoom ?? 1,
  })

  const containerSizeRef = useRef<ContainerSize>({ width: 0, height: 0 })

  // Drag state refs
  const isDraggingRef = useRef(false)
  const pointerDownRef = useRef({ x: 0, y: 0 })
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const velocityRef = useRef({ x: 0, y: 0 })
  const inertiaRafRef = useRef<number>(0)
  const visibleRafRef = useRef<number>(0)

  // Always-fresh refs for use inside event handlers (avoids stale closure captures)
  const visibleTilesRef = useRef<TileLayout<T>[]>([])
  const onItemClickRef = useRef(onItemClick)
  onItemClickRef.current = onItemClick

  // visibleTiles IS state — triggers React re-render, but only when set changes
  const [visibleTiles, setVisibleTiles] = useState<TileLayout<T>[]>([])
  // Expose a read-only snapshot of viewport to consumers
  const [viewportSnapshot, setViewportSnapshot] = useState<Viewport>({ ...vpRef.current })

  // Compute all tile positions — only recalculates when items or layout options change
  const {
    tiles: allTiles,
    totalWidth,
    totalHeight,
    columnHeights,
  } = useMemo(
    () => computeLayout(items, { columnWidth, gap, layout }),
    [items, columnWidth, gap, layout],
  )

  // Per-column Y repeat periods for seamless Y wrapping (each column wraps at its own height).
  // Map key = tile.x coordinate for that column, value = repeat period in canvas px.
  const columnPeriods = useMemo<Map<number, number> | undefined>(() => {
    if (!wrap || !wrapY || columnHeights.length === 0) return undefined
    const map = new Map<number, number>()
    for (let i = 0; i < columnHeights.length; i++) {
      map.set(i * (columnWidth + gap), columnHeights[i])
    }
    return map
  }, [wrap, wrapY, columnHeights, columnWidth, gap])

  // wrapPeriodX = totalWidth + gap: the rightmost tile's right edge is at totalWidth,
  // so the next copy must start at totalWidth + gap to maintain consistent column gaps at the seam.
  const wrapPeriodX = totalWidth + gap

  // Always-fresh wrap state for use inside rAF/event closures (avoids stale captures)
  const wrapStateRef = useRef({ wrap, wrapPeriodX, columnPeriods })
  wrapStateRef.current = { wrap, wrapPeriodX, columnPeriods }

  // Apply transform to DOM directly — no React re-render
  const applyTransform = useCallback(() => {
    const { x, y, zoom } = vpRef.current
    if (transformRef.current) {
      transformRef.current.style.transform = `translate3d(${x}px, ${y}px, 0px) scale(${zoom})`
    }
  }, [])

  // Schedule visibleTiles recalculation — debounced via rAF
  const scheduleVisibleUpdate = useCallback(() => {
    cancelAnimationFrame(visibleRafRef.current)
    visibleRafRef.current = requestAnimationFrame(() => {
      const totalSize = wrap ? { width: wrapPeriodX, height: 0 } : undefined
      const next = getVisibleTiles(
        allTiles,
        vpRef.current,
        containerSizeRef.current,
        overscan,
        totalSize,
        wrap,
        wrapY,
        columnPeriods,
      )
      visibleTilesRef.current = next
      setVisibleTiles(next)
      setViewportSnapshot({ ...vpRef.current })
    })
  }, [allTiles, overscan, wrap, wrapY, wrapPeriodX, columnPeriods])

  // Clamp zoom — when wrapping, prevent zooming out so far that the full canvas is visible at once.
  // Use ×1.5 multiplier: at the floor the visible area is ~67% of the canvas (grid always extends beyond viewport).
  const clampZoom = (z: number) => {
    let floor = minZoom
    if (wrap && totalWidth > 0) {
      const { width: cw, height: ch } = containerSizeRef.current
      if (cw > 0) {
        let wrapFloor = (cw / wrapPeriodX) * 1.5
        if (wrapY && totalHeight > 0 && ch > 0) {
          wrapFloor = Math.max(wrapFloor, (ch / (totalHeight + gap)) * 1.5)
        }
        floor = Math.max(minZoom, wrapFloor)
      }
    }
    return Math.min(maxZoom, Math.max(floor, z))
  }

  // ── Pan ──────────────────────────────────────────────────────────────────

  const stopInertia = useCallback(() => {
    cancelAnimationFrame(inertiaRafRef.current)
    velocityRef.current = { x: 0, y: 0 }
  }, [])

  const startInertia = useCallback(() => {
    const tick = () => {
      const vx = velocityRef.current.x * FRICTION
      const vy = velocityRef.current.y * FRICTION
      velocityRef.current = { x: vx, y: vy }

      if (Math.abs(vx) < MIN_VELOCITY && Math.abs(vy) < MIN_VELOCITY) {
        scheduleVisibleUpdate()
        return
      }

      vpRef.current.x += vx
      vpRef.current.y += vy
      applyTransform()
      scheduleVisibleUpdate()
      inertiaRafRef.current = requestAnimationFrame(tick)
    }
    inertiaRafRef.current = requestAnimationFrame(tick)
  }, [applyTransform, scheduleVisibleUpdate])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      stopInertia()
      isDraggingRef.current = true
      pointerDownRef.current = { x: e.clientX, y: e.clientY }
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      velocityRef.current = { x: 0, y: 0 }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.currentTarget.style.cursor = 'grabbing'
      if (transformRef.current) transformRef.current.style.pointerEvents = 'none'
    },
    [stopInertia],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return
      const dx = e.clientX - lastPointerRef.current.x
      const dy = e.clientY - lastPointerRef.current.y
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      velocityRef.current = { x: dx, y: dy }
      vpRef.current.x += dx
      vpRef.current.y += dy
      applyTransform()
      scheduleVisibleUpdate()
    },
    [applyTransform, scheduleVisibleUpdate],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      e.currentTarget.releasePointerCapture(e.pointerId)
      e.currentTarget.style.cursor = 'grab'
      if (transformRef.current) transformRef.current.style.pointerEvents = ''

      // Fire onItemClick if displacement is below 5px (tap, not drag)
      const dx = e.clientX - pointerDownRef.current.x
      const dy = e.clientY - pointerDownRef.current.y
      if (onItemClickRef.current && dx * dx + dy * dy < 25) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          const { x: vpX, y: vpY, zoom } = vpRef.current
          const cx = (e.clientX - rect.left - vpX) / zoom
          const cy = (e.clientY - rect.top - vpY) / zoom
          const hit = visibleTilesRef.current.find(
            (t) => cx >= t.x && cx < t.x + t.width && cy >= t.y && cy < t.y + t.height,
          )
          if (hit) onItemClickRef.current(hit.item, hit, e.nativeEvent)
        }
      }

      startInertia()
    },
    [startInertia],
  )

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      e.currentTarget.style.cursor = 'grab'
      if (transformRef.current) transformRef.current.style.pointerEvents = ''
      stopInertia()
      scheduleVisibleUpdate()
    },
    [stopInertia, scheduleVisibleUpdate],
  )

  // ── Zoom — registered as non-passive to allow preventDefault ────────────

  // Stored in a ref so the useEffect below can always call the latest version
  const handleWheelRef = useRef<(e: WheelEvent) => void>(() => {})
  handleWheelRef.current = (e: WheelEvent) => {
    e.preventDefault()

    const { x, y, zoom } = vpRef.current
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    if (e.ctrlKey || e.metaKey) {
      // Pinch-to-zoom on trackpad sends ctrlKey
      const factor = 1 - e.deltaY * 0.01
      const newZoom = clampZoom(zoom * factor)
      const ratio = newZoom / zoom
      vpRef.current.x = cx - (cx - x) * ratio
      vpRef.current.y = cy - (cy - y) * ratio
      vpRef.current.zoom = newZoom
    } else if (e.shiftKey) {
      vpRef.current.x -= e.deltaY
    } else {
      // Two-finger scroll = pan
      vpRef.current.x -= e.deltaX
      vpRef.current.y -= e.deltaY
    }

    applyTransform()
    scheduleVisibleUpdate()
  }

  // ── Measure container ────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      containerSizeRef.current = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }
      scheduleVisibleUpdate()
    })
    observer.observe(el)

    // Register wheel as non-passive so we can preventDefault (blocks page scroll)
    const onWheel = (e: WheelEvent) => handleWheelRef.current(e)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      observer.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [scheduleVisibleUpdate])

  // ── Initial render + allTiles change ────────────────────────────────────

  useEffect(() => {
    applyTransform()
    scheduleVisibleUpdate()
  }, [applyTransform, scheduleVisibleUpdate])

  // ── Cleanup ──────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(inertiaRafRef.current)
      cancelAnimationFrame(visibleRafRef.current)
    }
  }, [])

  // ── Imperative API ───────────────────────────────────────────────────────

  const panTo = useCallback(
    (x: number, y: number) => {
      vpRef.current.x = x
      vpRef.current.y = y
      const { wrap: w, wrapPeriodX: tw } = wrapStateRef.current
      if (w) normalizeViewport(vpRef.current, tw)
      applyTransform()
      scheduleVisibleUpdate()
    },
    [applyTransform, scheduleVisibleUpdate],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: clampZoom is inline; minZoom/maxZoom are hook params biome misidentifies as outer scope
  const zoomTo = useCallback(
    (zoom: number, center?: { x: number; y: number }) => {
      const newZoom = clampZoom(zoom)
      if (center) {
        const ratio = newZoom / vpRef.current.zoom
        vpRef.current.x = center.x - (center.x - vpRef.current.x) * ratio
        vpRef.current.y = center.y - (center.y - vpRef.current.y) * ratio
      }
      vpRef.current.zoom = newZoom
      const { wrap: w, wrapPeriodX: tw } = wrapStateRef.current
      if (w) normalizeViewport(vpRef.current, tw)
      applyTransform()
      scheduleVisibleUpdate()
    },
    [applyTransform, scheduleVisibleUpdate, minZoom, maxZoom],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: clampZoom is inline; minZoom/maxZoom are hook params biome misidentifies as outer scope
  const fitToView = useCallback(() => {
    const { width, height } = containerSizeRef.current
    if (width === 0 || height === 0 || totalWidth === 0 || totalHeight === 0) return
    const zoom = clampZoom(Math.min(width / totalWidth, height / totalHeight) * 0.9)
    const x = (width - totalWidth * zoom) / 2
    const y = (height - totalHeight * zoom) / 2
    vpRef.current = { x, y, zoom }
    applyTransform()
    scheduleVisibleUpdate()
  }, [applyTransform, scheduleVisibleUpdate, totalWidth, totalHeight, minZoom, maxZoom])

  // ── Props ────────────────────────────────────────────────────────────────

  const tileProps = useCallback(
    (tile: TileLayout<T>): { style: CSSProperties } => ({
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: tile.width,
        height: tile.height,
        contain: 'layout style paint',
        transform: `translate(${tile.x}px, ${tile.y}px)`,
      },
    }),
    [],
  )

  return {
    containerRef,
    transformRef,
    containerProps: {
      style: CONTAINER_STYLE,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    transformProps: {
      style: TRANSFORM_STYLE,
    },
    tileProps,
    visibleTiles,
    allTiles,
    viewport: viewportSnapshot,
    totalSize: { width: totalWidth, height: totalHeight },
    panTo,
    zoomTo,
    fitToView,
  }
}
