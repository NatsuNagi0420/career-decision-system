/**
 * API 响应和错误类型定义
 */

// 基础响应结构
export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data: T
  timestamp?: number
  traceId?: string
}

// 分页响应
export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

// 分页请求参数
export interface PaginationParams {
  page?: number
  pageSize?: number
}

// API 错误类
export class ApiError extends Error {
  code: number
  traceId?: string

  constructor(message: string, code: number, traceId?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.traceId = traceId
  }
}

// 错误码枚举
export enum ErrorCode {
  // 系统级错误码（0-999）
  SUCCESS = 0,
  INVALID_PARAMS = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  SERVER_ERROR = 500,

  // 业务级错误码（1000+）
  USER_NOT_FOUND = 1001,
  USER_ALREADY_EXISTS = 1002,
  ENTRY_INCOMPLETE = 1003,
  MBTI_NOT_COMPLETED = 1004,
  RESUME_PARSE_FAILED = 1005,
  JOB_NOT_FOUND = 1006,
  CAPABILITY_GENERATION_FAILED = 1007,
  PATH_GENERATION_FAILED = 1008,
  REPORT_GENERATION_FAILED = 1009
}

// 请求配置扩展
export interface RequestConfig {
  showLoading?: boolean
  showError?: boolean
  errorMessage?: string
}
