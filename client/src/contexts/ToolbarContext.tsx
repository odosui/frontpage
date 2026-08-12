import * as React from 'react'
import { createContext, useContext, useState } from 'react'

/**
 * The dashboard's controls live in the top bar, which is rendered outside the
 * router. The Dashboard publishes them here and the TopBar picks them up.
 */
export interface DashboardTools {
  dashboards: string[]
  current: string
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onRefreshAll: () => void
  isRefreshing: boolean
  onAddWidget: () => void
}

interface ToolbarValue {
  tools: DashboardTools | null
  setTools: (tools: DashboardTools | null) => void
}

const ToolbarContext = createContext<ToolbarValue>({
  tools: null,
  setTools: () => undefined,
})

export const ToolbarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [tools, setTools] = useState<DashboardTools | null>(null)

  return (
    <ToolbarContext.Provider value={{ tools, setTools }}>
      {children}
    </ToolbarContext.Provider>
  )
}

export const useToolbar = () => useContext(ToolbarContext)
