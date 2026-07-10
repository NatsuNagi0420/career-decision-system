import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo } from '@/types/models'
import { getUserInfoApi, loginApi, logoutApi, type LoginResponseDTO, type UserLoginPayload } from '@/api/user'
import {
  clearSession,
  getAccessToken,
  getStoredUser,
  persistSession,
  persistStoredUser
} from '@/utils/session'

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo | null>(null)
  const token = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isLoggedIn = computed(() => !!token.value && !!userInfo.value)
  const userName = computed(() => userInfo.value?.username ?? 'Guest')
  const userAvatar = computed(() => userInfo.value?.avatar ?? '')

  const login = async (payload: UserLoginPayload) => {
    loading.value = true
    error.value = null

    try {
      const response: LoginResponseDTO = await loginApi(payload)
      userInfo.value = response.user as UserInfo
      token.value = response.token
      persistSession(response)
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
      userInfo.value = user as UserInfo
      persistStoredUser(user)
      return user
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      loading.value = false
    }
  }

  const logout = async () => {
    try {
      if (getAccessToken()) {
        await logoutApi()
      }
    } catch {
      // Local logout should still complete if the server session is already gone.
    } finally {
      userInfo.value = null
      token.value = null
      clearSession()
    }
  }

  const initFromCookie = () => {
    token.value = getAccessToken() || null
    userInfo.value = getStoredUser() as UserInfo | null
  }

  initFromCookie()

  return {
    userInfo,
    token,
    loading,
    error,
    isLoggedIn,
    userName,
    userAvatar,
    login,
    fetchUserInfo,
    logout,
    initFromCookie
  }
})
