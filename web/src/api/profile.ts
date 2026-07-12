import { get, put } from '@/utils/request'

export type UserProfile = {
  userId: number
  displayName: string | null
  identityType: string | null
  school: string | null
  major: string | null
  degree: string | null
  grade: string | null
  graduationDate: string | null
  city: string | null
  targetRole: string | null
  targetCities: string[]
  expectedSalary: string | null
  currentConfusion: string | null
  existingDirections: string[]
  weeklyAvailableMinutes: number | null
  onboardingCompleted: boolean
  profileVersion: number
  skills: string[]
  certificates: string[]
  experiences: string[]
  values: string[]
  preferredIndustries: string[]
  preferredWorkModes: string[]
  constraints: string[]
  externalAiConsent: boolean
  completed: boolean
  updatedAt: string | null
}

export type UserProfilePayload = {
  displayName?: string | null
  identityType?: string | null
  school?: string | null
  major?: string | null
  degree?: string | null
  grade?: string | null
  graduationDate?: string | null
  city?: string | null
  targetRole?: string | null
  targetCities?: string[]
  expectedSalary?: string | null
  currentConfusion?: string | null
  existingDirections?: string[]
  weeklyAvailableMinutes?: number | null
  skills?: string[]
  certificates?: string[]
  experiences?: string[]
  values?: string[]
  preferredIndustries?: string[]
  preferredWorkModes?: string[]
  constraints?: string[]
  externalAiConsent?: boolean
  completeOnboarding?: boolean
  expectedVersion?: number
}

export const getProfileApi = () => get<UserProfile>('/users/me/profile')
export const saveProfileApi = (data: UserProfilePayload) =>
  put<UserProfile>('/users/me/profile', data)
