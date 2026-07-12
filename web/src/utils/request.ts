import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { m3Message } from '@/design-system/services/feedback'
import type { ApiResponse, RequestConfig } from '@/types/api'
import { ApiError } from '@/types/api'
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  persistSession,
  type AuthSession
} from '@/utils/session'

const DEV_BACKEND_PORT = '8443'
const PROD_BACKEND_BASE_URL = 'https://api.career-decision.example'
const REQUEST_ID_HEADER = 'X-Request-ID'

export function createClientRequestId() {
  const randomUuid = globalThis.crypto?.randomUUID?.()
  const randomPart = randomUuid || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `web-${randomPart}`
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function resolveDevBackendBaseUrl() {
  if (typeof window === 'undefined') return `https://localhost:${DEV_BACKEND_PORT}`

  const hostname = window.location.hostname || 'localhost'
  return `https://${hostname}:${DEV_BACKEND_PORT}`
}

function resolveBackendBaseUrl() {
  const configuredBackend = import.meta.env.VITE_BACKEND_BASE_URL?.trim()
  if (configuredBackend) return stripTrailingSlash(configuredBackend)

  const legacyApiBase = import.meta.env.VITE_API_BASE_URL?.trim()
  if (legacyApiBase) {
    return stripTrailingSlash(legacyApiBase.replace(/\/api(?:\/v1)?\/?$/, ''))
  }

  return import.meta.env.PROD ? PROD_BACKEND_BASE_URL : resolveDevBackendBaseUrl()
}

export const BACKEND_BASE_URL = resolveBackendBaseUrl()
export const API_BASE_URL = `${BACKEND_BASE_URL}/api/v1`

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  __careerRetried?: boolean
}

const service: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
})

let refreshPromise: Promise<string> | null = null
let lastErrorMessage = ''
let lastErrorAt = 0

function isAuthEndpoint(url = '') {
  return /\/auth\//.test(url)
}

function responseMessage(data: unknown) {
  const body = data as Partial<ApiResponse>
  return body?.message || body?.msg || 'Request failed'
}

function normalizeError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const message = responseMessage(error.response?.data)
    if (message && message !== 'Request failed') return new Error(message)
    if (error.code === 'ECONNABORTED') return new Error('请求超时，请稍后重试')
    if (!error.response) return new Error('网络连接失败，请检查后端服务是否运行')
    if (error.response.status === 401) return new Error('登录已过期，请重新登录')
    if (error.response.status === 429) return new Error('请求过于频繁，请稍后再试')
    if (error.response.status >= 500) return new Error('服务暂时不可用，请稍后重试')
    return new Error(error.message || 'Request failed')
  }
  return error instanceof Error ? error : new Error('Request failed')
}

function reportError(error: Error) {
  const now = Date.now()
  if (error.message !== lastErrorMessage || now - lastErrorAt > 2500) {
    m3Message.error(error.message)
    lastErrorMessage = error.message
    lastErrorAt = now
  }
}

function redirectToLogin() {
  if (typeof window === 'undefined' || window.location.pathname === '/login') return
  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}&expired=1`)
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    clearSession()
    return ''
  }

  if (!refreshPromise) {
    refreshPromise = axios
      .post<ApiResponse<AuthSession>>(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        { timeout: 30000, headers: { [REQUEST_ID_HEADER]: createClientRequestId() } }
      )
      .then((response) => {
        const session = response.data.data
        if (!session?.token || !session?.user) {
          throw new Error('Invalid refresh response')
        }
        persistSession(session)
        return session.token
      })
      .catch((error) => {
        clearSession()
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

service.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (!config.headers.get(REQUEST_ID_HEADER)) {
    config.headers.set(REQUEST_ID_HEADER, createClientRequestId())
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const body = response.data
    if (typeof body?.code === 'number' && body.code !== 0 && body.code !== 200) {
      const error = new ApiError(responseMessage(body), body.code, body.traceId)
      reportError(error)
      throw error
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined
    const status = error.response?.status

    if (
      axios.isAxiosError(error) &&
      status === 401 &&
      originalRequest &&
      !originalRequest.__careerRetried &&
      !isAuthEndpoint(originalRequest.url) &&
      getRefreshToken()
    ) {
      originalRequest.__careerRetried = true
      try {
        const token = await refreshAccessToken()
        if (token) {
          originalRequest.headers = originalRequest.headers ?? {}
          originalRequest.headers.Authorization = `Bearer ${token}`
          return service(originalRequest)
        }
      } catch {
        redirectToLogin()
      }
    }

    const normalized = normalizeError(error)
    reportError(normalized)
    return Promise.reject(normalized)
  }
)

const request = <T = unknown>(
  config: AxiosRequestConfig & RequestConfig
): Promise<T> => {
  return service.request<ApiResponse<T>>(config).then((res) => res.data.data)
}

export const get = <T = unknown>(
  url: string,
  params?: unknown,
  config?: RequestConfig
): Promise<T> => request<T>({ url, method: 'get', params, ...config })

export const post = <T = unknown>(
  url: string,
  data?: unknown,
  config?: RequestConfig
): Promise<T> => request<T>({ url, method: 'post', data, ...config })

export const put = <T = unknown>(
  url: string,
  data?: unknown,
  config?: RequestConfig
): Promise<T> => request<T>({ url, method: 'put', data, ...config })

export const patch = <T = unknown>(
  url: string,
  data?: unknown,
  config?: RequestConfig
): Promise<T> => request<T>({ url, method: 'patch', data, ...config })

export const del = <T = unknown>(
  url: string,
  params?: unknown,
  config?: RequestConfig
): Promise<T> => request<T>({ url, method: 'delete', params, ...config })

export default request
