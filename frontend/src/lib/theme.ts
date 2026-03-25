export const GLOBAL_THEME_STORAGE_KEY = 'user-theme:last'

export const getThemeStorageKey = (userId: string) => `user-theme:${userId}`

export const applyThemeClass = (enabled: boolean) => {
  document.documentElement.classList.toggle('dark', enabled)
}

export const readBooleanFromStorage = (storageKey: string): boolean | null => {
  const value = window.localStorage.getItem(storageKey)
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  return null
}

export const bootstrapThemeFromStorage = () => {
  const stored = readBooleanFromStorage(GLOBAL_THEME_STORAGE_KEY)
  if (stored !== null) {
    applyThemeClass(stored)
  }
}