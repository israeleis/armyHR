import { useState, useEffect } from 'react'

export type Theme = 'dark' | 'light'
const THEME_KEY = 'army-hr-theme'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem(THEME_KEY) as Theme) ?? 'dark'
  )

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return { theme, toggleTheme }
}
