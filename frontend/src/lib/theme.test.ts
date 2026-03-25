import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GLOBAL_THEME_STORAGE_KEY,
  applyThemeClass,
  bootstrapThemeFromStorage,
  readBooleanFromStorage,
} from './theme'

describe('theme helpers', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('reads boolean values from storage keys', () => {
    window.localStorage.setItem('a', 'true')
    window.localStorage.setItem('b', 'false')
    window.localStorage.setItem('c', 'nope')

    expect(readBooleanFromStorage('a')).toBe(true)
    expect(readBooleanFromStorage('b')).toBe(false)
    expect(readBooleanFromStorage('c')).toBeNull()
  })

  it('applies theme class directly', () => {
    applyThemeClass(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    applyThemeClass(false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('bootstraps theme class from global storage key', () => {
    window.localStorage.setItem(GLOBAL_THEME_STORAGE_KEY, 'true')
    bootstrapThemeFromStorage()
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    window.localStorage.setItem(GLOBAL_THEME_STORAGE_KEY, 'false')
    bootstrapThemeFromStorage()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('does nothing if no valid stored value exists', () => {
    const spy = vi.spyOn(document.documentElement.classList, 'toggle')
    bootstrapThemeFromStorage()
    expect(spy).not.toHaveBeenCalled()
  })
})
