/**
 * 模块：前端认证状态工具。
 * 职责：基于 Cookie 读取与判断当前登录用户信息，为路由与组件提供登录态判断能力。
 */
import Cookies from 'js-cookie'

export type UserInfo = {
  id?: number | string
  username?: string
  avatar?: string
}

export const getUserInfo = (): UserInfo | null => {
  const raw = Cookies.get('userInfo')
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserInfo
  } catch {
    return null
  }
}

export const isLoggedIn = (): boolean => {
  const user = getUserInfo()
  return !!user?.id
}

