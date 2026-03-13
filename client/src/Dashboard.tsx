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

  const deleteWidget = useCallback(
    (id: string) => {
      if (!window.confirm('Delete this widget?')) return
      api.deleteWidget(id).then(() => {
        setLayout((prev) => prev.filter((item) => item.i !== id))
      })
    },
    [],
  )

  const refreshWidget = useCallback((id: string) => {
    setRefreshing((prev) => new Set(prev).add(id))
    api.refreshWidget(id).then((data: { items: Article[] }) => {
      setLayout((prev) =>
        prev.map((item) => (item.i === id ? { ...item, items: data.items } : item)),
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
          layout={layout.map((item) => ({ ...item, minW: WIDGET_MIN_W, minH: WIDGET_MIN_H }))}
          width={width}
          gridConfig={{ cols: GRID_COLS, rowHeight: GRID_ROW_HEIGHT }}
          dragConfig={{ enabled: true, handle: '.widget-header' }}
          resizeConfig={{ enabled: true }}
          onLayoutChange={onLayoutChange}
        >
          {layout.map((item) => (
            <div key={item.i} className="widget">
              <div className="widget-header">
                {item.i}
                <div className="widget-menu-wrap">
                  <button
                    className="widget-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenu(openMenu === item.i ? null : item.i)
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="3" r="1.5" />
                      <circle cx="8" cy="8" r="1.5" />
                      <circle cx="8" cy="13" r="1.5" />
                    </svg>
                  </button>
                  {openMenu === item.i && (
                    <div className="widget-menu" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="widget-menu-item"
                        disabled={refreshing.has(item.i)}
                        onClick={() => {
                          setOpenMenu(null)
                          refreshWidget(item.i)
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1.33 2.67v4h4M14.67 13.33v-4h-4" />
                          <path d="M13.01 6a5.33 5.33 0 0 0-8.8-1.97L1.33 6.67M2.99 10a5.33 5.33 0 0 0 8.8 1.97l2.88-2.64" />
                        </svg>
                        Refresh
                      </button>
                      <button
                        className="widget-menu-item widget-menu-item--danger"
                        onClick={() => deleteWidget(item.i)}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 0 1 1.34-1.34h2.66a1.33 1.33 0 0 1 1.34 1.34V4M6.67 7.33v4M9.33 7.33v4M12.67 4v9.33a1.33 1.33 0 0 1-1.34 1.34H4.67a1.33 1.33 0 0 1-1.34-1.34V4" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="widget-body">
                {refreshing.has(item.i) && (
                  <div className="widget-loading">Refreshing...</div>
                )}
                {item.items && item.items.length > 0 ? (
                  <ul className="article-list">
                    {item.items.map((article) => (
                      <li key={article.url} className={`article-item${article.new ? ' article-item--new' : ''}`}>
                        <a href={article.url} target="_blank" rel="noopener noreferrer" className="article-link">
                          {article.image && (
                            <img src={article.image} alt="" className="article-image" />
                          )}
                          <span className="article-title">
                            {article.new && <span className="article-badge">NEW</span>}
                            {article.title}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="widget-placeholder">No articles yet</p>
                )}
              </div>
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}

export default Dashboard
