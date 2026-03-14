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
import DashboardSwitcher from './DashboardSwitcher'
import RefreshIcon from './icons/RefreshIcon'
import PlusIcon from './icons/PlusIcon'
import 'react-grid-layout/css/styles.css'

const GRID_COLS = 24
const GRID_ROW_HEIGHT = 40
const WIDGET_MIN_W = 2
const WIDGET_MIN_H = 4

const Dashboard: React.FC = () => {
  const [dashboardId, setDashboardId] = useState('default')
  const [dashboards, setDashboards] = useState<string[]>([])
  const [layout, setLayout] = useState<ApiLayoutItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set())
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
        const posChanged = mapped.some((m) => {
          const p = prev.find((o) => o.i === m.i)
          return !p || p.x !== m.x || p.y !== m.y || p.w !== m.w || p.h !== m.h
        })
        if (posChanged) {
          saveLayout(dashboardId, mapped.map(({ items, ...rest }) => rest))
        }
        return mapped
      })
    },
    [saveLayout, dashboardId],
  )

  const deleteWidget = useCallback((id: string) => {
    if (!window.confirm('Delete this widget?')) return
    api.deleteWidget(dashboardId, id).then(() => {
      setLayout((prev) => prev.filter((item) => item.i !== id))
    })
  }, [dashboardId])

  const refreshWidget = useCallback((id: string) => {
    setRefreshing((prev) => new Set(prev).add(id))
    api.refreshWidget(dashboardId, id).then((data: { items: Article[] }) => {
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
  }, [dashboardId])

  const refreshAll = useCallback(() => {
    layout.forEach((item) => refreshWidget(item.i))
  }, [layout, refreshWidget])

  const addWidget = useCallback((widget: ApiLayoutItem) => {
    api.addWidget(dashboardId, widget).then(() => {
      setLayout((prev) => [...prev, widget])
      refreshWidget(widget.i)
    })
  }, [dashboardId, refreshWidget])

  const handleCreateDashboard = useCallback((name: string) => {
    api.createDashboard(name).then((res: { id?: string; error?: string }) => {
      if (res.id) {
        loadDashboards()
        setDashboardId(res.id)
      }
    })
  }, [loadDashboards])

  const handleDeleteDashboard = useCallback((id: string) => {
    if (!window.confirm(`Delete dashboard "${id}"?`)) return
    api.deleteDashboard(id).then(() => {
      loadDashboards()
      if (dashboardId === id) setDashboardId('default')
    })
  }, [dashboardId, loadDashboards])

  const handleRenameDashboard = useCallback((id: string, name: string) => {
    api.renameDashboard(id, name).then((res: { id?: string }) => {
      if (res.id) {
        loadDashboards()
        if (dashboardId === id) setDashboardId(res.id)
      }
    })
  }, [dashboardId, loadDashboards])

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
        <DashboardSwitcher
          dashboards={dashboards}
          current={dashboardId}
          onSelect={setDashboardId}
          onCreate={handleCreateDashboard}
          onDelete={handleDeleteDashboard}
          onRename={handleRenameDashboard}
        />
        <div className="tool-panel-actions">
          <button className={`tool-panel-btn tool-panel-btn--secondary${refreshing.size > 0 ? ' is-refreshing' : ''}`} onClick={refreshAll} disabled={refreshing.size > 0}>
            <RefreshIcon />
            Refresh all
          </button>
          <button className="tool-panel-btn tool-panel-btn--primary" onClick={() => setShowAddModal(true)}>
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
