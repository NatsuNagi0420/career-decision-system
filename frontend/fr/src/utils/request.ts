/**
 * 模块：Axios 请求封装。
 * 职责：统一配置基础 URL、超时与请求/响应拦截器，并导出通用 request 方法供各业务模块调用。
 */
import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import Cookies from 'js-cookie'
import { ElMessage } from 'element-plus'
import type { ApiResponse, RequestConfig } from '@/types/api'
import { ApiError, ErrorCode } from '@/types/api'

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

    // 如果 code 不是 0 或 200，说明业务上有错误
    if (res.code !== 0 && res.code !== 200) {
      const errorMsg = res.msg || 'Error'

      // 根据错误码进行不同处理
      switch (res.code) {
        case ErrorCode.UNAUTHORIZED:
          // 401 未登录处理
          ElMessage.error('登录已过期，请重新登录')
          Cookies.remove('userInfo')
          Cookies.remove('token')
          setTimeout(() => {
            window.location.href = '/login'
          }, 1500)
          break

        case ErrorCode.FORBIDDEN:
          ElMessage.error('没有权限访问')
          break

        case ErrorCode.NOT_FOUND:
          ElMessage.error('请求的资源不存在')
          break

        case ErrorCode.SERVER_ERROR:
          ElMessage.error('服务器错误，请稍后重试')
          break

        default:
          // 其他业务错误
          ElMessage.error(errorMsg)
      }

      return Promise.reject(new ApiError(errorMsg, res.code, res.traceId))
    }

    return response
  },
  (error) => {
    console.error('网络请求错误:', error)

    // 处理网络错误
    if (error.response) {
      // 服务器返回了错误状态码
      const status = error.response.status
      switch (status) {
        case 401:
          ElMessage.error('登录已过期，请重新登录')
          Cookies.remove('userInfo')
          Cookies.remove('token')
          setTimeout(() => {
            window.location.href = '/login'
          }, 1500)
          break
        case 403:
          ElMessage.error('没有权限访问')
          break
        case 404:
          ElMessage.error('请求的资源不存在')
          break
        case 500:
          ElMessage.error('服务器错误，请稍后重试')
          break
        default:
          ElMessage.error(`请求失败: ${status}`)
      }
    } else if (error.request) {
      // 请求已发出但没有收到响应
      ElMessage.error('网络连接失败，请检查网络')
    } else {
      // 其他错误
      ElMessage.error('请求失败，请稍后重试')
    }

    return Promise.reject(error)
  }
)

/**
 * 封装通用请求方法
 */
const request = <T = unknown>(
  config: AxiosRequestConfig & RequestConfig
): Promise<T> => {
  return service.request<ApiResponse<T>>(config).then((res) => res.data.data)
}

/**
 * GET 请求
 */
export const get = <T = unknown>(
  url: string,
  params?: unknown,
  config?: RequestConfig
): Promise<T> => {
  return request<T>({ url, method: 'get', params, ...config })
}

/**
 * POST 请求
 */
export const post = <T = unknown>(
  url: string,
  data?: unknown,
  config?: RequestConfig
): Promise<T> => {
  return request<T>({ url, method: 'post', data, ...config })
}

/**
 * PUT 请求
 */
export const put = <T = unknown>(
  url: string,
  data?: unknown,
  config?: RequestConfig
): Promise<T> => {
  return request<T>({ url, method: 'put', data, ...config })
}

/**
 * DELETE 请求
 */
export const del = <T = unknown>(
  url: string,
  params?: unknown,
  config?: RequestConfig
): Promise<T> => {
  return request<T>({ url, method: 'delete', params, ...config })
}

export default request
