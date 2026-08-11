export default {
  // Dashboard management
  listDashboards: () => api('get', '/dashboards'),
  createDashboard: (name: string) => apiJson('post', '/dashboards', { name }),
  deleteDashboard: (id: string) => api('delete', `/dashboards/${id}`),
  renameDashboard: (id: string, name: string) =>
    apiJson('patch', `/dashboards/${id}`, { name }),

  // Layout operations scoped to a dashboard
  getLayout: (dashboardId: string) =>
    api('get', `/dashboards/${dashboardId}/layout`),
  saveLayout: (dashboardId: string, layout: LayoutItem[]) =>
    apiJson('put', `/dashboards/${dashboardId}/layout`, { layout }),
  addWidget: (dashboardId: string, widget: LayoutItem) =>
    apiJson('post', `/dashboards/${dashboardId}/widget`, { widget }),
  deleteWidget: (dashboardId: string, id: string) =>
    api('delete', `/dashboards/${dashboardId}/widget/${id}`),
  refreshWidget: (dashboardId: string, id: string) =>
    api('post', `/dashboards/${dashboardId}/widget/${id}/refresh`),
  getWidgetItems: (dashboardId: string, id: string) =>
    api('get', `/dashboards/${dashboardId}/widget/${id}/items`),

  // Jobs
  listJobs: (limit = 50) => api('get', '/jobs', { limit }),
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
  payload: { dashboardId?: string; widgetId?: string; url?: string }
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

export type Article = {
  title: string
  url: string
  image: string
  new?: boolean
}

export type LayoutItem = {
  i: string
  x: number
  y: number
  w: number
  h: number
  url: string
  items?: Article[]
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
