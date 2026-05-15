import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useCanvasMasonry, type CanvasItem, type LayoutMode, type TileLayout } from 'use-canvas-masonry'

// Picsum gives us images with known aspect ratios via seed + size params.
// We define the dimensions we want, then request that exact size.
const SIZES = [
  { w: 400, h: 600 }, { w: 600, h: 400 }, { w: 500, h: 500 },
  { w: 400, h: 550 }, { w: 600, h: 450 }, { w: 400, h: 300 },
  { w: 500, h: 700 }, { w: 600, h: 600 }, { w: 400, h: 400 },
  { w: 500, h: 350 }, { w: 400, h: 580 }, { w: 600, h: 360 },
  { w: 450, h: 600 }, { w: 600, h: 500 }, { w: 400, h: 480 },
  { w: 500, h: 450 }, { w: 600, h: 380 }, { w: 400, h: 520 },
  { w: 550, h: 400 }, { w: 400, h: 650 }, { w: 300, h: 400 },
  { w: 700, h: 500 }, { w: 400, h: 250 }, { w: 600, h: 700 },
  { w: 500, h: 300 }, { w: 400, h: 700 }, { w: 600, h: 550 },
  { w: 350, h: 500 }, { w: 600, h: 300 }, { w: 500, h: 600 },
]

type Photo = CanvasItem & {
  id: number
  src: string
  placeholderColor: string
}

// Palette of muted placeholder colors
const PLACEHOLDER_COLORS = [
  '#1a1a2e', '#16213e', '#0f3460', '#533483',
  '#2d4739', '#1b3a2d', '#2c3e50', '#34495e',
  '#4a1942', '#2c1654', '#1a3a4a', '#3d2b1f',
]

function buildPhotos(count: number): Photo[] {
  return Array.from({ length: count }, (_, i) => {
    const { w, h } = SIZES[i % SIZES.length]
    return {
      id: i + 1,
      width: w,
      height: h,
      src: `https://picsum.photos/seed/${i + 1}/${w}/${h}`,
      placeholderColor: PLACEHOLDER_COLORS[i % PLACEHOLDER_COLORS.length],
    }
  })
}

const PHOTOS = buildPhotos(1000)

// FPS counter
function useFps() {
  const [fps, setFps] = useState(0)
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())

  useEffect(() => {
    let rafId: number
    const tick = () => {
      frameCountRef.current++
      const now = performance.now()
      if (now - lastTimeRef.current >= 1000) {
        setFps(frameCountRef.current)
        frameCountRef.current = 0
        lastTimeRef.current = now
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return fps
}

// Module-level cache — survives tile remounts caused by wrapKey changes.
// Without this, every viewport normalization snap would flash all images back to placeholders.
const loadedSrcs = new Set<string>()

// Individual tile — memo prevents re-renders when sibling tiles change
const Tile = memo(function Tile({ tile, style }: { tile: TileLayout<Photo>; style: CSSProperties }) {
  const [loaded, setLoaded] = useState(() => loadedSrcs.has(tile.item.src))
  const onLoad = useCallback(() => {
    loadedSrcs.add(tile.item.src)
    setLoaded(true)
  }, [])
  return (
    <div style={style}>
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 8,
          overflow: 'hidden',
          background: tile.item.placeholderColor,
        }}
      >
        <img
          src={tile.item.src}
          alt=""
          draggable={false}
          loading="eager"
          decoding="async"
          onLoad={onLoad}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.3s ease-out',
          }}
        />
      </div>
    </div>
  )
})

const Toolbar = memo(function Toolbar({
  layout,
  onLayoutChange,
  wrap,
  onWrapChange,
  onFitToView,
  visibleCount,
  totalCount,
  fps,
}: {
  layout: LayoutMode
  onLayoutChange: (l: LayoutMode) => void
  wrap: boolean
  onWrapChange: (w: boolean) => void
  onFitToView: () => void
  visibleCount: number
  totalCount: number
  fps: number
}) {
  const btnStyle = (active: boolean): CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    background: active ? '#fff' : 'rgba(255,255,255,0.12)',
    color: active ? '#000' : '#fff',
    transition: 'background 0.15s',
  })

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: '8px 12px',
      }}
    >
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginRight: 4 }}>
        use-canvas-masonry
      </span>
      <button style={btnStyle(layout === 'masonry')} onClick={() => onLayoutChange('masonry')}>
        Masonry
      </button>
      <button style={btnStyle(layout === 'grid')} onClick={() => onLayoutChange('grid')}>
        Grid
      </button>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
      <button style={btnStyle(wrap)} onClick={() => onWrapChange(!wrap)}>
        Wrap
      </button>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
      <button
        style={{ ...btnStyle(false), background: 'rgba(255,255,255,0.08)' }}
        onClick={onFitToView}
      >
        Fit
      </button>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'monospace' }}>
        {visibleCount}/{totalCount} tiles · {fps} fps
      </span>
    </div>
  )
})

export default function App() {
  const [layout, setLayout] = useState<LayoutMode>('masonry')
  const [wrap, setWrap] = useState(true)
  const [lastClicked, setLastClicked] = useState<number | null>(null)
  const fps = useFps()

  const { containerRef, transformRef, containerProps, transformProps, tileProps, visibleTiles, allTiles, fitToView } =
    useCanvasMasonry<Photo>({
      items: PHOTOS,
      columnWidth: 300,
      gap: 12,
      layout,
      maxZoom: 4,
      overscan: 300,
      wrap,
      onItemClick: (item) => setLastClicked(item.id),
    })

  return (
    <>
      <Toolbar
        layout={layout}
        onLayoutChange={setLayout}
        wrap={wrap}
        onWrapChange={setWrap}
        onFitToView={fitToView}
        visibleCount={visibleTiles.length}
        totalCount={allTiles.length}
        fps={fps}
      />

      {lastClicked !== null && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          padding: '8px 16px', color: '#fff', fontSize: 13, pointerEvents: 'none',
        }}>
          Clicked photo #{lastClicked}
        </div>
      )}

      {/* Outer container — fixed, full viewport */}
      <div ref={containerRef} {...containerProps}>
        {/* Transform layer — single GPU compositor layer */}
        <div ref={transformRef} {...transformProps}>
          {visibleTiles.map((tile) => (
            <Tile key={tile.wrapKey ?? tile.index} tile={tile} style={tileProps(tile).style} />
          ))}
        </div>
      </div>
    </>
  )
}
