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
import AddWidgetModal from './AddWidgetModal'
import 'react-grid-layout/css/styles.css'

const GRID_COLS = 24
const GRID_ROW_HEIGHT = 40
const WIDGET_MIN_W = 2
const WIDGET_MIN_H = 4

const Dashboard: React.FC = () => {
  const [layout, setLayout] = useState<ApiLayoutItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
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

  const refreshAll = useCallback(() => {
    layout.forEach((item) => refreshWidget(item.i))
  }, [layout, refreshWidget])

  const addWidget = useCallback((widget: ApiLayoutItem) => {
    api.addWidget(widget).then(() => {
      setLayout((prev) => [...prev, widget])
      refreshWidget(widget.i)
    })
  }, [refreshWidget])

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
      <div className="tool-panel">
        <button className="tool-panel-btn tool-panel-btn--secondary" onClick={refreshAll}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh all
        </button>
        <button className="tool-panel-btn tool-panel-btn--primary" onClick={() => setShowAddModal(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add new
        </button>
      </div>
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
      <AddWidgetModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addWidget}
      />
    </div>
  )
}

export default Dashboard
