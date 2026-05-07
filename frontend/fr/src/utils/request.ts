/**
 * 模块：Axios 请求封装。
 * 职责：统一配置基础 URL、超时与请求/响应拦截器，并导出通用 request 方法供各业务模块调用。
 */
import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import Cookies from 'js-cookie'

// 基础响应结构定义 (根据后端实际情况调整)
export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data: T
}

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api', // 基础路径
  timeout: 10000 // 超时时间 10s
})


// 请求拦截器
service.interceptors.request.use(
  (config) => {
    // 在这里可以统一添加 token 等 header
    const token = Cookies.get('token')
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const res = response.data
    
    // 如果 code 不是 200，说明业务上有错误
    if (res.code !== 200) {
      // 这里可以集成通用的错误提示逻辑（如使用 ElMessage, msg 等）
      console.error(res.msg || 'Error')
      
      // 示例：401 未登录处理
      if (res.code === 401) {
        Cookies.remove('userInfo')
        Cookies.remove('token')
        window.location.href = '/login'
      }
      
      return Promise.reject(new Error(res.msg || 'Error'))
    }
    
    return response
  },
  (error) => {
    console.error('网络请求错误:', error)
    return Promise.reject(error)
  }
)

/**
 * 封装通用请求方法
 */
const request = <T = unknown>(config: AxiosRequestConfig): Promise<T> => {
  return service.request<ApiResponse<T>>(config).then((res) => res.data.data)
}

export default request
