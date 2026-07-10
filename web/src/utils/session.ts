import Cookies from 'js-cookie'

export type SessionUser = {
  id: number | string
  username: string
  email?: string
  phone?: string
  avatar?: string
}

export type AuthSession = {
  token: string
  refreshToken?: string
  user: SessionUser
}

export const ACCESS_TOKEN_KEY = 'career_token'
export const REFRESH_TOKEN_KEY = 'career_refresh_token'
export const USER_KEY = 'career_user'
export const SESSION_REFRESHED_EVENT = 'career-auth-session-refreshed'
export const SESSION_CLEARED_EVENT = 'career-auth-session-cleared'

const LEGACY_TOKEN_COOKIE = 'token'
const LEGACY_REFRESH_COOKIE = 'refreshToken'
const LEGACY_USER_COOKIE = 'userInfo'

function emitSessionEvent(name: string, detail?: unknown) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail }))
  }
}

function readJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function getAccessToken(): string {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || Cookies.get(LEGACY_TOKEN_COOKIE) || ''
}

export function getRefreshToken(): string {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || Cookies.get(LEGACY_REFRESH_COOKIE) || ''
}

export function getStoredUser(): SessionUser | null {
  return (
    readJson<SessionUser>(localStorage.getItem(USER_KEY)) ||
    readJson<SessionUser>(Cookies.get(LEGACY_USER_COOKIE))
  )
}

export function persistSession(session: AuthSession) {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.token)
  localStorage.setItem(USER_KEY, JSON.stringify(session.user))
  Cookies.set(LEGACY_TOKEN_COOKIE, session.token, { expires: 7 })
  Cookies.set(LEGACY_USER_COOKIE, JSON.stringify(session.user), { expires: 7 })

  if (session.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken)
    Cookies.set(LEGACY_REFRESH_COOKIE, session.refreshToken, { expires: 30 })
  }

  emitSessionEvent(SESSION_REFRESHED_EVENT, session)
}

export function persistStoredUser(user: SessionUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  Cookies.set(LEGACY_USER_COOKIE, JSON.stringify(user), { expires: 7 })
  emitSessionEvent(SESSION_REFRESHED_EVENT, {
    token: getAccessToken(),
    refreshToken: getRefreshToken(),
    user
  })
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  Cookies.remove(LEGACY_TOKEN_COOKIE)
  Cookies.remove(LEGACY_REFRESH_COOKIE)
  Cookies.remove(LEGACY_USER_COOKIE)
  emitSessionEvent(SESSION_CLEARED_EVENT)
}

export function isSessionPresent(): boolean {
  return !!getAccessToken() && !!getStoredUser()?.id
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
