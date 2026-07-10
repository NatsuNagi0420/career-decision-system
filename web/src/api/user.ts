import request from '@/utils/request'
import type { SessionUser } from '@/utils/session'

export type UserRegisterPayload = {
  username: string
  phone?: string
  password: string
  confirmPassword: string
  email?: string
}

export type UserLoginPayload = {
  username: string
  password: string
}

export type UserDTO = SessionUser

export type LoginResponseDTO = {
  user: UserDTO
  token: string
  refreshToken: string
}

export const registerApi = (data: UserRegisterPayload) => {
  return request<UserDTO>({
    url: '/auth/register',
    method: 'post',
    data
  })
}

export const loginApi = (data: UserLoginPayload) => {
  return request<LoginResponseDTO>({
    url: '/auth/login',
    method: 'post',
    data
  })
}

export const refreshApi = (refreshToken: string) => {
  return request<LoginResponseDTO>({
    url: '/auth/refresh',
    method: 'post',
    data: { refreshToken }
  })
}

export const logoutApi = () => {
  return request<void>({
    url: '/auth/logout',
    method: 'post',
    data: {}
  })
}

export const getUserInfoApi = () => {
  return request<UserDTO>({
    url: '/users/me',
    method: 'get'
  })
}
