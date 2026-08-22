/**
 * One path segment, escaped.
 *
 * Ids here are not always tame: a source's id is its name, and a subreddit is
 * called "r/energy". Interpolated raw, that slash reads as another segment and
 * the request lands on no route at all — a 404 rather than a fetch. Every id
 * that goes into a path goes through this.
 */
const seg = (value: string | number) => encodeURIComponent(String(value))

export default {
  // Sources
  listSources: () => api('get', '/sources'),
  createSource: (source: NewSource) => apiJson('post', '/sources', source),
  updateSource: (id: string, patch: Partial<NewSource>) =>
    apiJson('patch', `/sources/${seg(id)}`, patch),
  deleteSource: (id: string) => api('delete', `/sources/${seg(id)}`),
  refreshSource: (id: string) => api('post', `/sources/${seg(id)}/refresh`),

  // Dashboard management
  listDashboards: () => api('get', '/dashboards'),
  createDashboard: (name: string) => apiJson('post', '/dashboards', { name }),
  deleteDashboard: (id: string) => api('delete', `/dashboards/${seg(id)}`),
  renameDashboard: (id: string, name: string) =>
    apiJson('patch', `/dashboards/${seg(id)}`, { name }),
  setDashboardPrompt: (id: string, prompt: string) =>
    apiJson('patch', `/dashboards/${seg(id)}`, { prompt }),

  /** The whole arc: stories, facts, predictions, sources and the latest feed. */
  getDashboard: (dashboardId: string) =>
    api('get', `/dashboards/${seg(dashboardId)}`),
  /**
   * One page of the latest headlines. `offset` is what the list's own "load
   * more" walks forward with; the reply carries `total`, which is what says
   * whether there is another page behind this one.
   */
  getFeed: (dashboardId: string, page: { limit?: number; offset?: number } = {}) =>
    api(
      'get',
      `/dashboards/${seg(dashboardId)}/feed` +
        `?limit=${page.limit ?? 100}&offset=${page.offset ?? 0}`,
    ),
  getStories: (dashboardId: string) =>
    api('get', `/dashboards/${seg(dashboardId)}/stories`),
  renameStory: (dashboardId: string, storyId: number, title: string) =>
    apiJson(
      'patch',
      `/dashboards/${seg(dashboardId)}/stories/${seg(storyId)}`,
      { title },
    ),
  /** Unfiles the story; its articles go back into the dashboard's queue. */
  deleteStory: (dashboardId: string, storyId: number) =>
    api('delete', `/dashboards/${seg(dashboardId)}/stories/${seg(storyId)}`),

  // Which sources this dashboard reads
  listDashboardSources: (dashboardId: string) =>
    api('get', `/dashboards/${seg(dashboardId)}/sources`),
  assignSource: (
    dashboardId: string,
    source: { sourceId: string } | NewSource,
  ) => apiJson('post', `/dashboards/${seg(dashboardId)}/sources`, source),
  unassignSource: (dashboardId: string, id: string) =>
    api('delete', `/dashboards/${seg(dashboardId)}/sources/${seg(id)}`),

  // Facts
  createFact: (dashboardId: string, fact: NewFact) =>
    apiJson('post', `/dashboards/${seg(dashboardId)}/facts`, fact),
  updateFact: (dashboardId: string, id: string, patch: FactPatch) =>
    apiJson('patch', `/dashboards/${seg(dashboardId)}/facts/${seg(id)}`, patch),
  deleteFact: (dashboardId: string, id: string) =>
    api('delete', `/dashboards/${seg(dashboardId)}/facts/${seg(id)}`),
  factsHistory: (dashboardId: string) =>
    api('get', `/dashboards/${seg(dashboardId)}/facts/history`),

  // Predictions
  createPrediction: (dashboardId: string, content: string) =>
    apiJson('post', `/dashboards/${seg(dashboardId)}/predictions`, { content }),
  updatePrediction: (dashboardId: string, id: number, content: string) =>
    apiJson('patch', `/dashboards/${seg(dashboardId)}/predictions/${seg(id)}`, {
      content,
    }),
  deletePrediction: (dashboardId: string, id: number) =>
    api('delete', `/dashboards/${seg(dashboardId)}/predictions/${seg(id)}`),

  // One article's own text
  extractArticleContent: (dashboardId: string, articleId: number) =>
    api(
      'post',
      `/dashboards/${seg(dashboardId)}/articles/${seg(articleId)}/content`,
    ),
  getArticleContent: (dashboardId: string, articleId: number) =>
    api(
      'get',
      `/dashboards/${seg(dashboardId)}/articles/${seg(articleId)}/content`,
    ),

  // Jobs
  listJobs: (limit = 50) => api('get', '/jobs', { limit }),

  // Agents
  listAgents: () => api('get', '/agents'),
  listAgentSessions: (dashboardId: string, limit = 30) =>
    api('get', `/dashboards/${seg(dashboardId)}/agents/sessions`, { limit }),
  getAgentSession: (id: number) => api('get', `/agents/sessions/${seg(id)}`),
  runAgent: (dashboardId: string, kind: string) =>
    apiJson('post', `/dashboards/${seg(dashboardId)}/agents/run`, { kind }),

  // Chat
  startChat: (dashboardId: string, kind: string) =>
    apiJson('post', `/dashboards/${seg(dashboardId)}/agents/chats`, { kind }),
  sendChatMessage: (sessionId: number, content: string) =>
    apiJson('post', `/agents/sessions/${seg(sessionId)}/messages`, { content }),
  decideProposal: (id: number, approve: boolean) =>
    apiJson('post', `/agents/proposals/${seg(id)}/decide`, { approve }),

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
    sources: number
    articles: number
    filings: number
    stories: number
    sourcesWithoutUrl: number
    sourcesNeverFetched: number
    /** Sources no dashboard reads — still fetched, still storing articles. */
    unreadSources: number
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
    name: string
    sources: number
    articles: number
    stories: number
    uncategorized: number
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
    sourceId?: string
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
   * Who published it, when that differs from the source that delivered it —
   * a link posted to reddit is nature.com's article, carried by the subreddit.
   * Null when the source's own name already says it.
   */
  publisher?: string | null
  /** Where it was posted, when it reached us by being posted: the permalink. */
  viaUrl?: string | null
  /**
   * When the outlet published it. Only feeds tell us this — a scraped front
   * page leaves it null, and `createdAt` (when we first saw it) is all there is.
   */
  publishedAt?: string | null
}

/**
 * Kinds of source we know how to pull from. `web`, `rss` and `reddit` are
 * implemented.
 */
export const SOURCE_KINDS = [
  'web',
  'rss',
  'reddit',
  'telegram',
  'twitter',
] as const

export type SourceKind = (typeof SOURCE_KINDS)[number]

/** The karma a reddit post needs before it is worth storing. */
export const DEFAULT_MIN_SCORE = 20

/**
 * Per-source settings. One bag rather than a field per kind: only reddit reads
 * `minScore`, and the kinds still to come will each want their own.
 */
export type SourceConfig = {
  minScore?: number
}

/**
 * A place we pull headlines from. Sources belong to nobody: any number of
 * dashboards may read the same one, and it is fetched once for all of them.
 */
export type Source = {
  id: string
  name: string
  kind: SourceKind
  url: string
  config: SourceConfig
  fetchedAt: string | null
  /** How many articles we hold from it, across every dashboard. */
  articleCount: number
  /** How many dashboards read it. */
  dashboardCount: number
}

/** A source on its way in. The name doubles as the id. */
export type NewSource = {
  name: string
  kind: SourceKind
  url: string
  config?: SourceConfig
}

/** A dashboard is one running arc — what used to be called a storyline. */
export type Dashboard = {
  id: string
  name: string
  prompt: string
  storyCount: number
  sourceCount: number
  createdAt: string
}

/** An article as the feed shows it: with the source it came from. */
export type FeedArticle = Article & {
  /** The database id — what an extract_content job is queued against. */
  id: number
  /** Null for an article that reached us without a source of its own. */
  sourceId: string | null
  createdAt: string
  /** Whether its text has been pulled from the page yet. */
  hasContent: boolean
  /** This dashboard has not filed it yet: no story, and not skipped. */
  uncategorized: boolean
  /** 1-10, as this dashboard's categorizing agent scored it; null until it ran. */
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
  sourceId: string
  content: string
  contentAt: string
  images: ArticleImage[]
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
 * Something the dashboard is taken to have established, as opposed to what any
 * one article claims. Written by the reader or by the analyst.
 */
export type Fact = {
  /** Stable within its dashboard across versions, e.g. "f3". */
  id: string
  content: string
  /** 1-5; see CONFIDENCE_LABELS. */
  confidence: number
  articleIds: number[]
  sources: FactSource[]
  createdAt: string
}

/**
 * The whole set as it stood at one point, and why it changed. Nothing is
 * edited in place — every revision, by the reader or the analyst, appends one
 * of these — so the list of them is the history of what the arc was taken to
 * know.
 */
export type FactsVersion = {
  id: number
  version: number
  facts: Fact[]
  author: 'reader' | 'analyst'
  /** Why the set was revised. The analyst always gives one; the reader may not. */
  reasoning: string | null
  createdAt: string
}

/** One citation, resolved: the article behind it. */
export type FactSource = {
  id: number
  title: string
  url: string
}

export type NewFact = {
  content: string
  confidence?: number
  articleIds?: number[]
}

/** Only what changed; anything left out stays as it was. */
export type FactPatch = {
  content?: string
  confidence?: number
  /** Left out, the fact keeps the articles it already cites. */
  articleIds?: number[]
}

/** 1 highly unlikely, 5 highly likely — the same five rungs a fact's confidence uses. */
export const LIKELIHOOD_LABELS: Record<number, string> = {
  1: 'highly unlikely',
  2: 'unlikely',
  3: 'even odds',
  4: 'likely',
  5: 'highly likely',
}

export const MIN_LIKELIHOOD = 1
export const MAX_LIKELIHOOD = 5

/** One estimate of a prediction's odds, and why it was made. */
export type Forecast = {
  id: number
  likelihood: number
  /** What it was before; null for the first forecast. */
  previous: number | null
  reasoning: string
  author: 'analyst' | 'reader'
  createdAt: string
}

/**
 * A claim about what happens next. The reader writes it; the analyst puts the
 * likelihood on it, and every move it makes is kept with its reasoning.
 */
export type Prediction = {
  id: number
  content: string
  /** 1-5; see LIKELIHOOD_LABELS. Null until it has been forecast. */
  likelihood: number | null
  /** Newest first. */
  forecasts: Forecast[]
  createdAt: string
  updatedAt: string
}

/** One story with the articles this dashboard filed under it. */
export type StoryFeedEntry = {
  id: number
  title: string
  slug: string
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
