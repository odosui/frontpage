export default {
  // Dashboard management
  listDashboards: () => api('get', '/dashboards'),
  createDashboard: (name: string) => apiJson('post', '/dashboards', { name }),
  deleteDashboard: (id: string) => api('delete', `/dashboards/${id}`),
  renameDashboard: (id: string, name: string) =>
    apiJson('patch', `/dashboards/${id}`, { name }),

  // Channels and the feed, scoped to a dashboard
  getDashboard: (dashboardId: string) =>
    api('get', `/dashboards/${dashboardId}`),
  getFeed: (dashboardId: string) =>
    api('get', `/dashboards/${dashboardId}/feed`),
  getStories: (dashboardId: string) =>
    api('get', `/dashboards/${dashboardId}/stories`),
  addChannel: (dashboardId: string, channel: Channel) =>
    apiJson('post', `/dashboards/${dashboardId}/channels`, { channel }),
  deleteChannel: (dashboardId: string, id: string) =>
    api('delete', `/dashboards/${dashboardId}/channels/${id}`),
  refreshChannel: (dashboardId: string, id: string) =>
    api('post', `/dashboards/${dashboardId}/channels/${id}/refresh`),

  // One article's own text, read off its page by the extract_content job
  extractArticleContent: (dashboardId: string, articleId: number) =>
    api('post', `/dashboards/${dashboardId}/articles/${articleId}/content`),
  getArticleContent: (dashboardId: string, articleId: number) =>
    api('get', `/dashboards/${dashboardId}/articles/${articleId}/content`),

  // Jobs
  listJobs: (limit = 50) => api('get', '/jobs', { limit }),

  // Agents
  listAgents: () => api('get', '/agents'),
  listAgentSessions: (dashboardId: string, limit = 30) =>
    api('get', `/dashboards/${dashboardId}/agents/sessions`, { limit }),
  getAgentSession: (id: number) => api('get', `/agents/sessions/${id}`),
  runAgent: (dashboardId: string, kind: string) =>
    apiJson('post', `/dashboards/${dashboardId}/agents/run`, { kind }),

  // Settings
  getDatabaseStats: () => api('get', '/stats/database'),
}

export type TableStat = { name: string; rows: number; bytes: number }

export type ServerStats = {
  postgres: {
    version: string
    startedAt: string | null
    settings: Record<string, string>
    connections: { active: number; idle: number; total: number; max: number }
    cacheHitRatio: number | null
    commits: number
    rollbacks: number
    deadlocks: number
    tempBytes: number
    statsResetAt: string | null
  }
  node: {
    version: string
    platform: string
    uptimeSec: number
    rssBytes: number
    heapUsedBytes: number
    heapTotalBytes: number
  }
  pool: { total: number; idle: number; waiting: number; max: number }
}

export type DatabaseStats = {
  server: ServerStats
  database: { name: string; bytes: number }
  tables: TableStat[]
  content: {
    dashboards: number
    channels: number
    articles: number
    newArticles: number
    channelsWithoutUrl: number
    channelsNeverFetched: number
    newestArticleAt: string | null
    oldestArticleAt: string | null
  }
  snapshots: { count: number; bytes: number; oldestAt: string | null }
  jobs: {
    byStatus: Partial<Record<JobStatus, number>>
    last24h: { total: number; succeeded: number; failed: number }
    avgDurationSec: number | null
    oldestQueuedAt: string | null
  }
  dashboards: {
    id: string
    channels: number
    articles: number
    lastFetchedAt: string | null
  }[]
}

export const JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
] as const

export type JobStatus = (typeof JOB_STATUSES)[number]

export type Job = {
  id: string
  type: string
  status: JobStatus
  payload: {
    dashboardId?: string
    channelId?: string
    articleId?: number
    url?: string
  }
  result: Record<string, unknown> | null
  error: string | null
  attempts: number
  maxAttempts: number
  runAt: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type JobStats = Record<JobStatus, number>

export const AGENT_STATUSES = ['running', 'finished', 'failed'] as const

export type AgentStatus = (typeof AGENT_STATUSES)[number]

export type AgentSession = {
  id: number
  kind: string
  dashboardId: string | null
  status: AgentStatus
  model: string
  error: string | null
  createdAt: string
  finishedAt: string | null
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export type AgentMessage = {
  id: number
  sessionId: number
  position: number
  role: MessageRole
  content: string
  toolName: string | null
  toolArgs: string[] | null
  model: string | null
  promptTokens: number | null
  completionTokens: number | null
  createdAt: string
}

export type AgentInfo = {
  kind: string
  name: string
  tools: { name: string; usage: string; description: string }[]
}

export type Article = {
  title: string
  url: string
  image: string
  new?: boolean
  /**
   * When the outlet published it. Only feeds tell us this — a scraped front
   * page leaves it null, and `createdAt` (when we first saw it) is all there is.
   */
  publishedAt?: string | null
}

/** Sources we know how to pull from. `web` and `rss` are implemented so far. */
export const CHANNEL_KINDS = ['web', 'rss', 'telegram', 'twitter'] as const

export type ChannelKind = (typeof CHANNEL_KINDS)[number]

export type Channel = {
  id: string
  kind: ChannelKind
  url: string
}

/** An article as the feed shows it: with the channel it came from. */
export type FeedArticle = Article & {
  /** The database id — what an extract_content job is queued against. */
  id: number
  channelId: string
  createdAt: string
  /** Whether its text has been pulled from the page yet. */
  hasContent: boolean
  /** 1-10, as scored by the categorizing agent; null until it has run. */
  importance: number | null
  /** Broadest first; empty until the article has been categorized. */
  tags: string[]
}

/**
 * A picture inside an article. Only ever a url — the image itself stays on the
 * publisher's server and the browser loads it from there.
 */
export type ArticleImage = {
  url: string
  alt: string | null
  caption: string | null
}

/** One article's stored text, as the modal shows it. */
export type ArticleContent = {
  title: string
  url: string
  channelId: string
  content: string
  contentAt: string
  images: ArticleImage[]
}

export type Storyline = {
  id: number
  title: string
  slug: string
}

/**
 * One story with the articles under it. The storyline is only a label — the
 * same one can head several entries, since the list is ordered by story.
 */
export type StoryFeedEntry = {
  id: number
  title: string
  slug: string
  storyline: Storyline | null
  /** The story's newest article — what the list is sorted by. */
  updatedAt: string
  articles: FeedArticle[]
}

type FetchParams = Parameters<typeof fetch>[1]

async function apiJson(method: string, url: string, data: any) {
  return api(method, url, data)
}

async function api(method: string, url: string, data?: Record<string, any>) {
  const attrs: FetchParams = {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  }

  if (data) {
    if (method === 'get') {
      url = `${url}?${toQuery(data)}`
    } else {
      attrs.body = JSON.stringify(data)
    }
  }

  // csrf
  const meta = document.querySelectorAll<HTMLMetaElement>(
    "[name='csrf-token']",
  )[0]
  if (meta) {
    // @ts-ignore
    attrs.headers['X-CSRF-Token'] = meta.content
  }

  // @ts-ignore
  const base = window.API_SERVER_URL || ''
  return fetch(`${base}/api${url}`, attrs).then((x) => {
    if (!x.ok) {
      return x.json().then((body: { error?: string }) => {
        throw new Error(body.error || `Request failed (${x.status})`)
      })
    }
    return x.json()
  })
}

function toQuery(data: { [k: string]: string | number }) {
  const esc = window.encodeURIComponent
  return (
    Object.keys(data)
      // @ts-ignore
      .map((k) => esc(k) + '=' + esc(data[k]))
      .join('&')
  )
}
