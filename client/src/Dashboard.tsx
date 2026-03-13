import * as React from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  GridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout'
import api, { type LayoutItem as ApiLayoutItem } from './api'
import debounce from './utils/debounce'
import 'react-grid-layout/css/styles.css'

const DEFAULT_LAYOUT: ApiLayoutItem[] = [
  { i: 'widget-1', x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  { i: 'widget-2', x: 4, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
  { i: 'widget-3', x: 8, y: 0, w: 4, h: 3, minW: 2, minH: 2 },
]

const Dashboard: React.FC = () => {
  const [layout, setLayout] = useState<ApiLayoutItem[]>(DEFAULT_LAYOUT)
  const [loaded, setLoaded] = useState(false)
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
      const mapped: ApiLayoutItem[] = newLayout.map((item: LayoutItem) => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: item.minW,
        minH: item.minH,
      }))
      setLayout(mapped)
      saveLayout(mapped)
    },
    [saveLayout],
  )

  if (!loaded) return null

  return (
    <div
      className="dashboard"
      ref={containerRef as React.LegacyRef<HTMLDivElement>}
    >
      {mounted && (
        <GridLayout
          layout={layout}
          width={width}
          gridConfig={{ cols: 12, rowHeight: 80 }}
          dragConfig={{ enabled: true, handle: '.widget-header' }}
          resizeConfig={{ enabled: true }}
          onLayoutChange={onLayoutChange}
        >
          {layout.map((item) => (
            <div key={item.i} className="widget">
              <div className="widget-header">{item.i}</div>
              <div className="widget-body">
                <p className="widget-placeholder">Widget content</p>
              </div>
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}

export default Dashboard
