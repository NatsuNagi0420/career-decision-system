import { getStoredUser, isSessionPresent, type SessionUser } from '@/utils/session'

export type UserInfo = SessionUser

export const getUserInfo = (): UserInfo | null => getStoredUser()

export const isLoggedIn = (): boolean => isSessionPresent()
