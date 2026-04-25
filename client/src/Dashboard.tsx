import * as React from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  GridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout'
import { useParams, useNavigate } from 'slim-react-router'
import api, { type LayoutItem as ApiLayoutItem, type Article } from './api'
import debounce from './utils/debounce'
import Widget from './Widget'
import AddWidgetModal from './AddWidgetModal'
import DashboardSwitcher from './DashboardSwitcher'
import RefreshIcon from './icons/RefreshIcon'
import PlusIcon from './icons/PlusIcon'
import 'react-grid-layout/css/styles.css'

const BASE_COLS = 24
const GRID_ROW_HEIGHT = 40
const WIDGET_MIN_W = 2
const WIDGET_MIN_H = 4

const Dashboard: React.FC = () => {
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dashboardId = routeId || 'default'
  const setDashboardId = useCallback(
    (id: string) => {
      navigate(`/db/${id}`)
    },
    [navigate],
  )
  const [dashboards, setDashboards] = useState<string[]>([])
  const [layout, setLayout] = useState<ApiLayoutItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const { width, containerRef, mounted } = useContainerWidth()

  const saveLayout = useRef(
    debounce((id: string, newLayout: ApiLayoutItem[]) => {
      api.saveLayout(id, newLayout)
    }, 500),
  ).current

  const loadDashboards = useCallback(() => {
    api.listDashboards().then((data: { dashboards: string[] }) => {
      setDashboards(data.dashboards || [])
    })
  }, [])

  useEffect(() => {
    loadDashboards()
  }, [loadDashboards])

  useEffect(() => {
    setLoaded(false)
    api.getLayout(dashboardId).then((data: { layout: ApiLayoutItem[] }) => {
      setLayout(data.layout && data.layout.length > 0 ? data.layout : [])
      setLoaded(true)
    })
  }, [dashboardId])

  const onLayoutChange = useCallback(
    (newLayout: Layout) => {
      setLayout((prev) => {
        const mapped: ApiLayoutItem[] = newLayout.map((item: LayoutItem) => {
          const existing = prev.find((p) => p.i === item.i)

          const t: ApiLayoutItem = {
            i: item.i,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            url: existing?.url ?? '',
            items: existing?.items,
          }

          return t
        })
        const posChanged = mapped.some((m) => {
          const p = prev.find((o) => o.i === m.i)
          return !p || p.x !== m.x || p.y !== m.y || p.w !== m.w || p.h !== m.h
        })
        if (posChanged) {
          saveLayout(
            dashboardId,
            mapped.map(({ items, ...rest }) => rest),
          )
        }
        return mapped
      })
    },
    [saveLayout, dashboardId],
  )

  const deleteWidget = useCallback(
    (id: string) => {
      if (!window.confirm('Delete this widget?')) return
      api.deleteWidget(dashboardId, id).then(() => {
        setLayout((prev) => prev.filter((item) => item.i !== id))
      })
    },
    [dashboardId],
  )

  const refreshWidget = useCallback(
    (id: string) => {
      setRefreshing((prev) => new Set(prev).add(id))
      setErrors((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      api
        .refreshWidget(dashboardId, id)
        .then((data: { items: Article[] }) => {
          setLayout((prev) =>
            prev.map((item) =>
              item.i === id ? { ...item, items: data.items } : item,
            ),
          )
        })
        .catch((err: Error) => {
          setErrors((prev) => new Map(prev).set(id, err.message))
        })
        .finally(() => {
          setRefreshing((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
        })
    },
    [dashboardId],
  )

  const refreshAll = useCallback(() => {
    layout.forEach((item) => refreshWidget(item.i))
  }, [layout, refreshWidget])

  const addWidget = useCallback(
    (widget: ApiLayoutItem) => {
      api.addWidget(dashboardId, widget).then(() => {
        setLayout((prev) => [...prev, widget])
        refreshWidget(widget.i)
      })
    },
    [dashboardId, refreshWidget],
  )

  const handleCreateDashboard = useCallback(
    (name: string) => {
      api.createDashboard(name).then((res: { id?: string; error?: string }) => {
        if (res.id) {
          loadDashboards()
          setDashboardId(res.id)
        }
      })
    },
    [loadDashboards, setDashboardId],
  )

  const handleDeleteDashboard = useCallback(
    (id: string) => {
      if (!window.confirm(`Delete dashboard "${id}"?`)) return
      api.deleteDashboard(id).then(() => {
        loadDashboards()
        if (dashboardId === id) setDashboardId('default')
      })
    },
    [dashboardId, loadDashboards, setDashboardId],
  )

  const handleRenameDashboard = useCallback(
    (id: string, name: string) => {
      api.renameDashboard(id, name).then((res: { id?: string }) => {
        if (res.id) {
          loadDashboards()
          if (dashboardId === id) setDashboardId(res.id)
        }
      })
    },
    [dashboardId, loadDashboards, setDashboardId],
  )

  useEffect(() => {
    if (!openMenu) return
    const close = () => setOpenMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenu])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (dashboards.length < 2) return
        const idx = dashboards.indexOf(dashboardId)
        if (idx === -1) return
        const delta = e.key === 'ArrowLeft' ? -1 : 1
        const next = (idx + delta + dashboards.length) % dashboards.length
        e.preventDefault()
        setDashboardId(dashboards[next]!)
      } else if (e.code === 'KeyR') {
        e.preventDefault()
        refreshAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dashboards, dashboardId, setDashboardId, refreshAll])

  // Calculate how many "pages" of BASE_COLS are needed based on widget positions
  const maxRight = layout.reduce(
    (max, item) => Math.max(max, item.x + item.w),
    0,
  )
  const pages = Math.max(1, Math.ceil(maxRight / BASE_COLS))
  // Add 1 extra page so users always have room to drag widgets further right
  const totalPages = pages + 1
  const gridCols = BASE_COLS * totalPages
  const gridWidth = width * totalPages

  if (!loaded) return null

  return (
    <div
      className="dashboard"
      ref={containerRef as React.LegacyRef<HTMLDivElement>}
    >
      <div className="tool-panel">
        <DashboardSwitcher
          dashboards={dashboards}
          current={dashboardId}
          onSelect={setDashboardId}
          onCreate={handleCreateDashboard}
          onDelete={handleDeleteDashboard}
          onRename={handleRenameDashboard}
        />
        <div className="tool-panel-actions">
          <button
            className={`tool-panel-btn tool-panel-btn--secondary${refreshing.size > 0 ? ' is-refreshing' : ''}`}
            onClick={refreshAll}
            disabled={refreshing.size > 0}
          >
            <RefreshIcon />
            Refresh all
          </button>
          <button
            className="tool-panel-btn tool-panel-btn--primary"
            onClick={() => setShowAddModal(true)}
          >
            <PlusIcon />
            Add new
          </button>
        </div>
      </div>
      {mounted && (
        <GridLayout
          layout={layout.map((item) => ({
            ...item,
            minW: WIDGET_MIN_W,
            minH: WIDGET_MIN_H,
          }))}
          width={gridWidth}
          gridConfig={{ cols: gridCols, rowHeight: GRID_ROW_HEIGHT }}
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
                error={errors.get(item.i)}
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
