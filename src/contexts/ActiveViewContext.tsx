import { useEffect, useReducer, type ReactNode } from 'react'

// ── Module-level store ─────────────────────────────────────────────────────

let _name: string | null = null
let _isModified = false
const _listeners = new Set<() => void>()

function _notify() { _listeners.forEach(fn => fn()) }

export function setActiveView(name: string | null) {
  _name = name
  _isModified = false
  _notify()
}

export function markActiveViewModified() {
  if (!_name) return
  _isModified = true
  _notify()
}

export function clearActiveView() {
  _name = null
  _isModified = false
  _notify()
}

// ── React hook ─────────────────────────────────────────────────────────────

export function useActiveView() {
  const [, forceRender] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    _listeners.add(forceRender)
    return () => { _listeners.delete(forceRender) }
  }, [])
  return { name: _name, isModified: _isModified }
}

// ── No-op provider (kept so router.tsx import still compiles) ──────────────

export function ActiveViewProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
