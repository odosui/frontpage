import * as React from 'react'
import { createContext, useContext, useMemo, useState } from 'react'
import { type Channel } from '../api'

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
  onAddChannel: () => void
  channels: Channel[]
  refreshingChannels: Set<string>
  channelErrors: Map<string, string>
  onRefreshChannel: (id: string) => void
  onDeleteChannel: (id: string) => void
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
  const value = useMemo(() => ({ tools, setTools }), [tools])

  return (
    <ToolbarContext.Provider value={value}>{children}</ToolbarContext.Provider>
  )
}

export const useToolbar = () => useContext(ToolbarContext)
