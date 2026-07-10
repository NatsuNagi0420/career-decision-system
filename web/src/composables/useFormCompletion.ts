/**
 * useFormCompletion - 表单完成度追踪 Composable
 *
 * 用于追踪表单的完成度和必填字段状态
 */
import { ref, computed, watch, type Ref } from 'vue'

export interface FieldConfig {
  required: boolean
  weight?: number // 字段权重，用于计算完成度
}

export function useFormCompletion<T extends Record<string, unknown>>(
  formData: Ref<T>,
  fieldConfigs: Record<string, FieldConfig>
) {
  const completedFields = ref<Set<string>>(new Set())

  // 检查字段是否已填写
  const isFieldCompleted = (field: string): boolean => {
    const value = formData.value[field]

    if (value === null || value === undefined || value === '') {
      return false
    }

    if (Array.isArray(value) && value.length === 0) {
      return false
    }

    if (typeof value === 'object' && Object.keys(value).length === 0) {
      return false
    }

    return true
  }

  // 更新完成字段集合
  const updateCompletedFields = () => {
    const newCompleted = new Set<string>()

    for (const field in fieldConfigs) {
      if (isFieldCompleted(field)) {
        newCompleted.add(field)
      }
    }

    completedFields.value = newCompleted
  }

  // 计算完成度百分比
  const completionPercentage = computed(() => {
    const totalWeight = Object.entries(fieldConfigs).reduce(
      (sum, [, config]) => sum + (config.weight || 1),
      0
    )

    const completedWeight = Array.from(completedFields.value).reduce(
      (sum, field) => {
        const config = fieldConfigs[field]
        return sum + (config?.weight || 1)
      },
      0
    )

    return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0
  })

  // 必填字段列表
  const requiredFields = computed(() => {
    return Object.entries(fieldConfigs)
      .filter(([, config]) => config.required)
      .map(([field]) => field)
  })

  // 未完成的必填字段
  const incompleteRequiredFields = computed(() => {
    return requiredFields.value.filter(field => !completedFields.value.has(field))
  })

  // 是否所有必填字段都已完成
  const allRequiredCompleted = computed(() => {
    return incompleteRequiredFields.value.length === 0
  })

  // 可选字段完成度
  const optionalFieldsCompletion = computed(() => {
    const optionalFields = Object.keys(fieldConfigs).filter(
      field => !fieldConfigs[field]?.required
    )

    if (optionalFields.length === 0) return 100

    const completedOptional = optionalFields.filter(field =>
      completedFields.value.has(field)
    ).length

    return Math.round((completedOptional / optionalFields.length) * 100)
  })

  // 监听表单数据变化
  watch(
    formData,
    () => {
      updateCompletedFields()
    },
    { deep: true, immediate: true }
  )

  return {
    completedFields,
    completionPercentage,
    requiredFields,
    incompleteRequiredFields,
    allRequiredCompleted,
    optionalFieldsCompletion,
    isFieldCompleted,
    updateCompletedFields
  }
}
