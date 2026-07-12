type StoredDraft<T> = {
  updatedAt: string
  data: T
}

const PREFIX = 'career.form-draft'

function storageKey(scope: string, userId: string | number | null | undefined) {
  return `${PREFIX}.${userId ?? 'anonymous'}.${scope}`
}

export function loadFormDraft<T>(scope: string, userId?: string | number | null): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(storageKey(scope, userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    if (!parsed?.updatedAt || parsed.data === undefined) return null
    return parsed
  } catch {
    return null
  }
}

export function saveFormDraft<T>(scope: string, userId: string | number | null | undefined, data: T) {
  const value: StoredDraft<T> = { updatedAt: new Date().toISOString(), data }
  localStorage.setItem(storageKey(scope, userId), JSON.stringify(value))
}

export function clearFormDraft(scope: string, userId?: string | number | null) {
  localStorage.removeItem(storageKey(scope, userId))
}
