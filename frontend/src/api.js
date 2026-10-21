/**
 * 單一 API 封裝（依 _bmad-output/implementation-artifacts/api-contract.md）
 * - 自動帶上 Authorization: Bearer <token>（token 存放於 localStorage）
 * - 401 → 清除 token 並導回登入頁
 * - 錯誤一律以 throw new Error(後端回應的 error 欄位) 拋出
 */

const TOKEN_KEY = 'inventory_token'
const BASE = '/api'

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch (e) {
    return null
  }
}

export function setToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch (e) {
    /* 忽略：隱私模式等情況 */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch (e) {
    /* 忽略 */
  }
}

/** 組出 query string，空白值略過 */
export function qs(params) {
  const search = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.append(key, value)
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

async function readBody(res) {
  const contentType = res.headers.get('content-type') || ''
  if (contentType.indexOf('application/json') >= 0) {
    try {
      return await res.json()
    } catch (e) {
      return null
    }
  }
  try {
    const text = await res.text()
    return text ? { error: text } : null
  } catch (e) {
    return null
  }
}

async function request(method, path, body, options = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    throw new Error('無法連線至後端伺服器，請確認後端服務是否已啟動')
  }

  const data = await readBody(res)

  if (res.status === 401 && !options.skipAuth) {
    clearToken()
    try {
      window.dispatchEvent(new CustomEvent('ims:unauthorized'))
    } catch (e) {
      /* 忽略 */
    }
    throw new Error((data && data.error) || '登入狀態已逾時，請重新登入')
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `請求失敗（HTTP ${res.status}）`)
  }

  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
}

export function login(username, password) {
  return request('POST', '/auth/login', { username, password }, { skipAuth: true })
}

export function logout() {
  return request('POST', '/auth/logout')
}

export function me() {
  return request('GET', '/auth/me')
}

export default api
