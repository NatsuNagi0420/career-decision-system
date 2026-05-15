import { describe, it, expect } from 'vitest'
import { createPinia } from 'pinia'

// 示例：测试 Store
describe('Store Tests', () => {
  it('should create pinia instance', () => {
    const pinia = createPinia()
    expect(pinia).toBeDefined()
  })
})

// 示例：测试 Composable
describe('Composable Tests', () => {
  it('should export composables', async () => {
    const { useApiRequest } = await import('@/composables')
    expect(useApiRequest).toBeDefined()
  })
})
