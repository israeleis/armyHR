import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../useTheme'

const THEME_KEY = 'army-hr-theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('light')
})

afterEach(() => {
  document.documentElement.classList.remove('light')
})

describe('useTheme', () => {
  it('defaults to dark when no stored value', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('reads saved light theme from localStorage', () => {
    localStorage.setItem(THEME_KEY, 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('toggleTheme flips dark to light and updates DOM class', () => {
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.toggleTheme() })
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })

  it('toggleTheme flips light to dark and removes DOM class', () => {
    localStorage.setItem(THEME_KEY, 'light')
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.toggleTheme() })
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })
})
