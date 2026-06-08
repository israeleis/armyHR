import { useEffect, type ReactNode } from 'react'

export function RtlProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dir = 'rtl'
    document.documentElement.lang = 'he'
  }, [])
  return <>{children}</>
}
