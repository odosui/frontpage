import * as React from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  GridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout'
import api, { type LayoutItem as ApiLayoutItem, type Article } from './api'
import debounce from './utils/debounce'
import Widget from './Widget'
import 'react-grid-layout/css/styles.css'

const GRID_COLS = 24
const GRID_ROW_HEIGHT = 40
const WIDGET_MIN_W = 2
const WIDGET_MIN_H = 4

const DEFAULT_LAYOUT: ApiLayoutItem[] = [
  { i: 'widget-1', x: 0, y: 0, w: 4, h: 6 },
  { i: 'widget-2', x: 4, y: 0, w: 4, h: 6 },
  { i: 'widget-3', x: 8, y: 0, w: 4, h: 6 },
]

const Dashboard: React.FC = () => {
  const [layout, setLayout] = useState<ApiLayoutItem[]>(DEFAULT_LAYOUT)
  const [loaded, setLoaded] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set())
  const { width, containerRef, mounted } = useContainerWidth()

  const saveLayout = useRef(
    debounce((newLayout: ApiLayoutItem[]) => {
      api.saveLayout(newLayout)
    }, 500),
  ).current

  useEffect(() => {
    api.getLayout().then((data: { layout: ApiLayoutItem[] }) => {
      if (data.layout && data.layout.length > 0) {
        setLayout(data.layout)
      }
      setLoaded(true)
    })
  }, [])

  const onLayoutChange = useCallback(
    (newLayout: Layout) => {
      setLayout((prev) => {
        const mapped: ApiLayoutItem[] = newLayout.map((item: LayoutItem) => {
          const existing = prev.find((p) => p.i === item.i)
          return {
            i: item.i,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            url: existing?.url,
            items: existing?.items,
          }
        })
        saveLayout(mapped)
        return mapped
      })
    },
    [saveLayout],
  )

  const deleteWidget = useCallback((id: string) => {
    if (!window.confirm('Delete this widget?')) return
    api.deleteWidget(id).then(() => {
      setLayout((prev) => prev.filter((item) => item.i !== id))
    })
  }, [])

  const refreshWidget = useCallback((id: string) => {
    setRefreshing((prev) => new Set(prev).add(id))
    api.refreshWidget(id).then((data: { items: Article[] }) => {
      setLayout((prev) =>
        prev.map((item) =>
          item.i === id ? { ...item, items: data.items } : item,
        ),
      )
      setRefreshing((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    })
  }, [])

  useEffect(() => {
    if (!openMenu) return
    const close = () => setOpenMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenu])

  if (!loaded) return null

  return (
    <div
      className="dashboard"
      ref={containerRef as React.LegacyRef<HTMLDivElement>}
    >
      {mounted && (
        <GridLayout
          layout={layout.map((item) => ({
            ...item,
            minW: WIDGET_MIN_W,
            minH: WIDGET_MIN_H,
          }))}
          width={width}
          gridConfig={{ cols: GRID_COLS, rowHeight: GRID_ROW_HEIGHT }}
          dragConfig={{ enabled: true, handle: '.widget-header' }}
          resizeConfig={{ enabled: true }}
          onLayoutChange={onLayoutChange}
        >
          {layout.map((item) => (
            <div key={item.i}>
              <Widget
                item={item}
                isMenuOpen={openMenu === item.i}
                isRefreshing={refreshing.has(item.i)}
                onMenuToggle={() =>
                  setOpenMenu(openMenu === item.i ? null : item.i)
                }
                onRefresh={() => {
                  setOpenMenu(null)
                  refreshWidget(item.i)
                }}
                onDelete={() => deleteWidget(item.i)}
              />
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}

export default Dashboard
