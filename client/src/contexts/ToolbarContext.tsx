import * as React from 'react'
import { createContext, useContext, useMemo, useState } from 'react'
import { type Dashboard, type FeedArticle, type Source } from '../api'

/**
 * The dashboard's controls live in the top bar, which is rendered outside the
 * router. The Dashboard publishes them here and the TopBar picks them up.
 *
 * The raw feed rides along too: it used to be a column on the page, and is now
 * a dropdown off the bar, so the page has to hand it over the same way it hands
 * over the source list.
 */
export interface DashboardTools {
  dashboards: Dashboard[]
  current: string
  currentName: string
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  /**
   * The arc's standing instruction to its agents, appended to every run and
   * chat turn on it, and the way the Agents modal changes it.
   */
  prompt: string
  onSavePrompt: (prompt: string) => Promise<void>

  /** The sources this dashboard reads — shared with whatever else reads them. */
  sources: Source[]
  refreshingSources: Set<string>
  sourceErrors: Map<string, string>
  isRefreshing: boolean
  onRefreshSource: (id: string) => void
  onRemoveSource: (id: string) => void
  onAddSource: () => void
  onRefreshAll: () => void

  /** The Latest dropdown: everything collected, filed or not. */
  feed: FeedArticle[]
  /** How many the dashboard holds in all, so the list knows if more remain. */
  feedTotal: number
  /** Walks one page further down the feed and appends it. */
  onLoadMoreFeed: () => void
  loadingMoreFeed: boolean
  uncategorized: number
  agentRunning: boolean
  onRunAgent: () => void
  onExtract: (articleId: number) => void
  onOpenArticle: (articleId: number) => void
  extracting: Set<number>
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
