/**
 * 模块：用户账户相关接口封装。
 * 职责：定义用户注册、登录与获取当前用户信息等接口的请求与返回类型。
 */
import request from '@/utils/request'

export type UserRegisterPayload = {
  username: string
  phone: string
  password: string
  confirmPassword: string
  email?: string
}

export type UserLoginPayload = {
  username: string
  password: string
}

export type UserDTO = {
  id: number
  username: string
  phone?: string
  email?: string
  avatar?: string
}

export type LoginResponseDTO = {
  user: UserDTO
  token: string
}

/**
 * 示例 API 模块：用户相关
 */

// 注册接口示例
export const registerApi = (data: UserRegisterPayload) => {
  return request<string>({
    url: '/user/register',
    method: 'post',
    data
  })
}

// 登录接口示例
export const loginApi = (data: UserLoginPayload) => {
  return request<LoginResponseDTO>({
    url: '/user/login',
    method: 'post',
    data
  })
}

// 获取用户信息示例
export const getUserInfoApi = () => {
  return request<UserDTO>({
    url: '/user/info',
    method: 'get'
  })
}
