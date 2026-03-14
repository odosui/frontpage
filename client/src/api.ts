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
}

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
  return fetch(`${base}/api${url}`, attrs).then((x) => x.json())
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
