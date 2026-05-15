# use-canvas-masonry

A React hook for building 60fps infinite canvas layouts with masonry or grid arrangement, viewport virtualization, and seamless infinite scroll.

## Features

- **Masonry & grid layouts** — automatic column sizing based on item count
- **Pan & zoom** — pointer drag with inertia, pinch-to-zoom, scroll wheel
- **Viewport virtualization** — only visible tiles are in the DOM
- **Infinite wrap-around** — seamless toroidal scrolling on X and/or Y axes
- **Click detection** — tap vs drag discrimination, hit-tested in canvas space
- **Imperative API** — `panTo`, `zoomTo`, `fitToView`

## Installation

```bash
npm install use-canvas-masonry
```

**Peer dependency:** React 18+

## Usage

```tsx
import { useCanvasMasonry, type CanvasItem } from 'use-canvas-masonry'

type Photo = CanvasItem & { id: number; src: string }

const photos: Photo[] = [
  { id: 1, width: 400, height: 600, src: '/photo1.jpg' },
  { id: 2, width: 600, height: 400, src: '/photo2.jpg' },
  // ...
]

export default function Gallery() {
  const { containerRef, transformRef, containerProps, transformProps, tileProps, visibleTiles } =
    useCanvasMasonry<Photo>({
      items: photos,
      columnWidth: 300,
      gap: 12,
      wrap: true,
      onItemClick: (item) => console.log('clicked', item.id),
    })

  return (
    <div ref={containerRef} {...containerProps}>
      <div ref={transformRef} {...transformProps}>
        {visibleTiles.map((tile) => (
          <div key={tile.wrapKey ?? tile.index} style={tileProps(tile).style}>
            <img src={tile.item.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

Your items must satisfy `CanvasItem`:

```ts
type CanvasItem = { width: number; height: number }
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `items` | `T[]` | — | Array of items to render. Each must have `width` and `height`. |
| `columnWidth` | `number` | `300` | Fixed column width in px. |
| `gap` | `number` | `30` | Gap between columns and rows in px. |
| `layout` | `'masonry' \| 'grid'` | `'masonry'` | Layout algorithm. |
| `minZoom` | `number` | `0.5` | Minimum zoom level. |
| `maxZoom` | `number` | `3` | Maximum zoom level. |
| `overscan` | `number` | `200` | Extra px rendered outside the viewport edges. |
| `initialViewport` | `Partial<Viewport>` | — | Starting `{ x, y, zoom }`. |
| `wrap` | `boolean` | `false` | Enable infinite horizontal wrap-around. |
| `wrapY` | `boolean` | `true` | Also wrap vertically. Requires `wrap: true`. |
| `onItemClick` | `(item, tile, event) => void` | — | Called on tap (pointer displacement < 5px). Not fired after drags. |

## Return value

| Property | Type | Description |
|---|---|---|
| `containerRef` | `RefObject<HTMLDivElement>` | Attach to the outer container div. |
| `transformRef` | `RefObject<HTMLDivElement>` | Attach to the inner transform div. |
| `containerProps` | `object` | Spread onto the outer container div. |
| `transformProps` | `object` | Spread onto the inner transform div. |
| `tileProps(tile)` | `(tile) => { style }` | Returns absolute-position style for a tile. |
| `visibleTiles` | `TileLayout<T>[]` | Tiles currently visible in the viewport — render these. |
| `allTiles` | `TileLayout<T>[]` | All computed tile positions. |
| `viewport` | `Viewport` | Read-only snapshot of current `{ x, y, zoom }`. |
| `totalSize` | `{ width, height }` | Total canvas dimensions (one period). |
| `panTo(x, y)` | `function` | Pan to an absolute canvas position. |
| `zoomTo(zoom, center?)` | `function` | Zoom to a level, optionally anchored to a screen point. |
| `fitToView()` | `function` | Fit all content into the viewport. |

### TileLayout

```ts
type TileLayout<T> = {
  item: T       // Original item
  index: number // Position in the items array
  x: number     // Canvas x position
  y: number     // Canvas y position
  width: number // Rendered width
  height: number // Rendered height
  wrapKey?: string // Unique React key when wrap is enabled — use as key={tile.wrapKey ?? tile.index}
}
```

## Rendering tiles

Use `tileProps(tile)` to position each tile and `tile.wrapKey ?? tile.index` as the React key:

```tsx
{visibleTiles.map((tile) => (
  <div key={tile.wrapKey ?? tile.index} style={tileProps(tile).style}>
    {/* tile content */}
  </div>
))}
```

When `wrap` is enabled, the same item appears at multiple canvas positions simultaneously. `wrapKey` encodes the position offset so React treats each copy as a distinct node.

## Infinite wrap-around

```tsx
useCanvasMasonry({
  items,
  wrap: true,   // infinite horizontal scroll
  wrapY: true,  // + infinite vertical scroll (default when wrap is true)
})
```

With `wrap` enabled, the zoom floor is automatically raised so the full canvas period is never fully visible at once, keeping the illusion seamless.

## Imperative control

```tsx
const { panTo, zoomTo, fitToView } = useCanvasMasonry({ items })

// Pan to canvas origin
panTo(0, 0)

// Zoom to 2× anchored to screen center
zoomTo(2, { x: window.innerWidth / 2, y: window.innerHeight / 2 })

// Fit all content
fitToView()
```

## License

MIT
