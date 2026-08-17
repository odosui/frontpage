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
  /** Refiles a story: an existing arc by id, a new one by title, or neither. */
  moveStory: (
    dashboardId: string,
    storyId: number,
    to: { storylineId?: number | null; storylineTitle?: string },
  ) => apiJson('patch', `/dashboards/${dashboardId}/stories/${storyId}/storyline`, to),

  getStoryline: (dashboardId: string, slug: string) =>
    api('get', `/dashboards/${dashboardId}/storylines/${slug}`),

  // Facts: what a storyline is taken to have established
  createFact: (dashboardId: string, slug: string, fact: NewFact) =>
    apiJson('post', `/dashboards/${dashboardId}/storylines/${slug}/facts`, fact),
  updateFact: (dashboardId: string, id: number, patch: FactPatch) =>
    apiJson('patch', `/dashboards/${dashboardId}/facts/${id}`, patch),
  deleteFact: (dashboardId: string, id: number) =>
    api('delete', `/dashboards/${dashboardId}/facts/${id}`),

  // Predictions: the reader writes the claim, the analyst puts odds on it
  createPrediction: (dashboardId: string, slug: string, content: string) =>
    apiJson('post', `/dashboards/${dashboardId}/storylines/${slug}/predictions`, {
      content,
    }),
  updatePrediction: (dashboardId: string, id: number, content: string) =>
    apiJson('patch', `/dashboards/${dashboardId}/predictions/${id}`, {
      content,
    }),
  deletePrediction: (dashboardId: string, id: number) =>
    api('delete', `/dashboards/${dashboardId}/predictions/${id}`),
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

  // Chat: a session that stays open, one queued turn per message
  /** `storyline` is a slug; the server turns it into the agent's context. */
  startChat: (dashboardId: string, kind: string, storyline?: string) =>
    apiJson('post', `/dashboards/${dashboardId}/agents/chats`, {
      kind,
      storyline,
    }),
  sendChatMessage: (sessionId: number, content: string) =>
    apiJson('post', `/agents/sessions/${sessionId}/messages`, { content }),
  /** Approving is what actually performs the change the agent asked for. */
  decideProposal: (id: number, approve: boolean) =>
    apiJson('post', `/agents/proposals/${id}/decide`, { approve }),

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
    uncategorizedArticles: number
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

export const PROPOSAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'failed',
] as const

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

/**
 * A change the agent wants to make, waiting on the reader. Nothing has happened
 * to the data until this is approved.
 */
export type Proposal = {
  id: number
  sessionId: number
  dashboardId: string
  kind: string
  payload: Record<string, unknown>
  /** What the agent proposed, in its own words — what the buttons act on. */
  summary: string
  status: ProposalStatus
  result: Record<string, unknown> | null
  error: string | null
  createdAt: string
  decidedAt: string | null
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
  /** Still waiting for the categorizing agent: no story, and not skipped. */
  uncategorized: boolean
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
  /** How many stories hang off it; only the full list carries this. */
  storyCount?: number
}

/** 1 someone said it, 5 established beyond doubt. */
export const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'rumour',
  2: 'one source',
  3: 'reported',
  4: 'corroborated',
  5: 'certain',
}

export const MIN_CONFIDENCE = 1
export const MAX_CONFIDENCE = 5
export const DEFAULT_CONFIDENCE = 3

/**
 * Something the storyline is taken to have established, as opposed to what any
 * one article claims. Written by the reader or by the analyst.
 */
export type Fact = {
  id: number
  storylineId: number
  content: string
  /** 1-5; see CONFIDENCE_LABELS. */
  confidence: number
  /** The article it rests on, when it rests on one we hold. */
  articleId: number | null
  articleTitle: string | null
  articleUrl: string | null
  createdAt: string
  updatedAt: string
}

export type NewFact = {
  content: string
  confidence?: number
  articleId?: number | null
}

/** Only what changed; anything left out stays as it was. */
export type FactPatch = {
  content?: string
  confidence?: number
  articleId?: number | null
}

/** One estimate of a prediction's odds, and why it was made. */
export type Forecast = {
  id: number
  probability: number
  /** What it was before; null for the first forecast. */
  previous: number | null
  reasoning: string
  author: 'analyst' | 'reader'
  createdAt: string
}

/**
 * A claim about what happens next. The reader writes it; the analyst puts the
 * probability on it, and every move it makes is kept with its reasoning.
 */
export type Prediction = {
  id: number
  storylineId: number
  content: string
  /** 0-100, or null until it has been forecast. */
  probability: number | null
  /** Newest first. */
  forecasts: Forecast[]
  createdAt: string
  updatedAt: string
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
    /**
     * Uppercased on the way out. `fetch` normalizes the standard verbs itself,
     * but PATCH is not one of them — a lowercase `patch` is sent as written,
     * and the preflight then asks for a method the server's
     * Access-Control-Allow-Methods list does not contain.
     */
    method: method.toUpperCase(),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  }

  if (data) {
    if (method.toLowerCase() === 'get') {
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
