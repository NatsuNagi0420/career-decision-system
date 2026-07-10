/**
 * useFormValidation - 表单验证 Composable
 *
 * 提供常用的表单验证规则和验证方法
 */
import { ref, computed, type Ref } from 'vue'

export interface ValidationRule {
  required?: boolean
  min?: number
  max?: number
  pattern?: RegExp
  validator?: (value: unknown) => boolean | string
  message?: string
}

export interface FieldValidation {
  rules: ValidationRule[]
  error: string | null
  touched: boolean
}

export function useFormValidation<T extends Record<string, unknown>>(
  initialValues: T
) {
  const values = ref<T>({ ...initialValues }) as Ref<T>
  const validations = ref<Record<string, FieldValidation>>({})
  const isSubmitting = ref(false)

  // 添加字段验证规则
  const addFieldValidation = (field: keyof T, rules: ValidationRule[]) => {
    validations.value[field as string] = {
      rules,
      error: null,
      touched: false
    }
  }

  // 验证单个字段
  const validateField = (field: keyof T): boolean => {
    const validation = validations.value[field as string]
    if (!validation) return true

    const value = values.value[field]
    validation.touched = true

    for (const rule of validation.rules) {
      // 必填验证
      if (rule.required && !value) {
        validation.error = rule.message || '此字段为必填项'
        return false
      }

      // 最小长度验证
      if (rule.min && typeof value === 'string' && value.length < rule.min) {
        validation.error = rule.message || `最少需要 ${rule.min} 个字符`
        return false
      }

      // 最大长度验证
      if (rule.max && typeof value === 'string' && value.length > rule.max) {
        validation.error = rule.message || `最多允许 ${rule.max} 个字符`
        return false
      }

      // 正则验证
      if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
        validation.error = rule.message || '格式不正确'
        return false
      }

      // 自定义验证
      if (rule.validator) {
        const result = rule.validator(value)
        if (result !== true) {
          validation.error = typeof result === 'string' ? result : (rule.message || '验证失败')
          return false
        }
      }
    }

    validation.error = null
    return true
  }

  // 验证所有字段
  const validateAll = (): boolean => {
    let isValid = true

    for (const field in validations.value) {
      if (!validateField(field as keyof T)) {
        isValid = false
      }
    }

    return isValid
  }

  // 重置表单
  const reset = () => {
    values.value = { ...initialValues }
    for (const field in validations.value) {
      const validation = validations.value[field]
      if (validation) {
        validation.error = null
        validation.touched = false
      }
    }
    isSubmitting.value = false
  }

  // 设置字段值
  const setFieldValue = (field: keyof T, value: unknown) => {
    values.value[field] = value as T[keyof T]
  }

  // 设置字段错误
  const setFieldError = (field: keyof T, error: string) => {
    const validation = validations.value[field as string]
    if (validation) {
      validation.error = error
    }
  }

  // 清除字段错误
  const clearFieldError = (field: keyof T) => {
    const validation = validations.value[field as string]
    if (validation) {
      validation.error = null
    }
  }

  // 计算属性：是否有错误
  const hasErrors = computed(() => {
    return Object.values(validations.value).some(v => v.error !== null)
  })

  // 计算属性：是否所有字段都已触碰
  const allTouched = computed(() => {
    return Object.values(validations.value).every(v => v.touched)
  })

  // 常用验证规则
  const rules = {
    required: (message?: string): ValidationRule => ({
      required: true,
      message: message || '此字段为必填项'
    }),

    email: (message?: string): ValidationRule => ({
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: message || '请输入有效的邮箱地址'
    }),

    phone: (message?: string): ValidationRule => ({
      pattern: /^1[3-9]\d{9}$/,
      message: message || '请输入有效的手机号码'
    }),

    minLength: (min: number, message?: string): ValidationRule => ({
      min,
      message: message || `最少需要 ${min} 个字符`
    }),

    maxLength: (max: number, message?: string): ValidationRule => ({
      max,
      message: message || `最多允许 ${max} 个字符`
    }),

    custom: (validator: (value: unknown) => boolean | string, message?: string): ValidationRule => ({
      validator,
      message
    })
  }

  return {
    values,
    validations,
    isSubmitting,
    hasErrors,
    allTouched,
    addFieldValidation,
    validateField,
    validateAll,
    reset,
    setFieldValue,
    setFieldError,
    clearFieldError,
    rules
  }
}
