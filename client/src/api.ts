export default {
  getStuff: (data?: { [k: string]: string | number }) =>
    api('get', '/stuff', data),
}

type FetchParams = Parameters<typeof fetch>[1]

async function api(
  method: string,
  url: string,
  data?: { [k: string]: string | number },
) {
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

// function toFormData(data: { [k: string]: string | Blob }) {
//   const formData = new FormData()
//   for (const name in data) {
//     const val = data[name]
//     if (val) {
//       formData.append(name, val)
//     }
//   }
//   return formData
// }

// async function multipart<T>(
//   url: string,
//   data?: { [key: string]: string | Blob },
//   method: 'POST' | 'PATCH' = 'POST',
// ): Promise<T | { error: string }> {
//   const params: FetchParams = {
//     method,
//     credentials: 'include',
//   }

//   if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
//     params.body = toFormData(data || {})
//   }

//   // @ts-ignore
//   const base = window.API_SERVER_URL || ''
//   const response = await fetch(`${base}/api${url}`, params)

//   if (response.status === 400) {
//     const e = await response.json()
//     return { error: e.error }
//   }

//   if (response.status > 299) {
//     throw new Error(response.statusText)
//   }

//   const res: T = (await response.json()) as T
//   return res
// }
