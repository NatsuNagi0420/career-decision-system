import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo } from '@/types/models'
import { getUserInfoApi, loginApi, type LoginResponseDTO, type UserLoginPayload } from '@/api/user'
import Cookies from 'js-cookie'

export const useUserStore = defineStore('user', () => {
  // State
  const userInfo = ref<UserInfo | null>(null)
  const token = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const isLoggedIn = computed(() => !!token.value && !!userInfo.value)
  const userName = computed(() => userInfo.value?.username ?? 'Guest')
  const userAvatar = computed(() => userInfo.value?.avatar ?? '')

  // Actions
  const login = async (payload: UserLoginPayload) => {
    loading.value = true
    error.value = null

    try {
      const response: LoginResponseDTO = await loginApi(payload)

      // 保存用户信息和 token
      userInfo.value = response.user
      token.value = response.token

      // 持久化到 Cookie
      Cookies.set('token', response.token, { expires: 7 })
      Cookies.set('userInfo', JSON.stringify(response.user), { expires: 7 })

      return response
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      loading.value = false
    }
  }

  const fetchUserInfo = async () => {
    loading.value = true
    error.value = null

    try {
      const user = await getUserInfoApi()
      userInfo.value = user

      // 更新 Cookie
      Cookies.set('userInfo', JSON.stringify(user), { expires: 7 })

      return user
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      loading.value = false
    }
  }

  const logout = () => {
    userInfo.value = null
    token.value = null

    // 清除 Cookie
    Cookies.remove('token')
    Cookies.remove('userInfo')

    // 清除其他 Store 的数据
    // 可以在这里调用其他 Store 的 reset 方法
  }

  const initFromCookie = () => {
    const storedToken = Cookies.get('token')
    const storedUserInfo = Cookies.get('userInfo')

    if (storedToken) {
      token.value = storedToken
    }

    if (storedUserInfo) {
      try {
        userInfo.value = JSON.parse(storedUserInfo)
      } catch (e) {
        console.error('Failed to parse userInfo from cookie:', e)
      }
    }
  }

  // 初始化时从 Cookie 恢复数据
  initFromCookie()

  return {
    // State
    userInfo,
    token,
    loading,
    error,

    // Getters
    isLoggedIn,
    userName,
    userAvatar,

    // Actions
    login,
    fetchUserInfo,
    logout,
    initFromCookie
  }
})
