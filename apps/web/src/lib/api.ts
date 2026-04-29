import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

// withCredentials: refresh_token vive em cookie httpOnly emitido pela API
// (path /api/auth, SameSite=strict). Sem isto o browser nao envia o cookie
// e /auth/refresh falha com 401.
export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// B-06: Refresh mutex — prevent concurrent refresh calls from multiple 401s
let isRefreshing = false
let failedQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = []

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error)
    } else {
      p.resolve(token!)
    }
  })
  failedQueue = []
}

// Response interceptor — handle 401 with queued refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Another refresh is in progress — queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(api(originalRequest))
            },
            reject,
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        // O refresh token vive no cookie httpOnly — basta enviar o pedido
        // com withCredentials (axios.create ja o tem). Body vazio.
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
        localStorage.setItem('access_token', data.accessToken)
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
        processQueue(null, data.accessToken)
        return api(originalRequest)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        localStorage.removeItem('access_token')
        localStorage.removeItem('user')
        window.location.href = '/entrar'
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)
