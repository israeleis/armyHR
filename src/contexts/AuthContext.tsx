import { createContext, useContext, useState, type ReactNode } from 'react'

const TOKEN_KEY   = 'army-hr-token'
const EXPIRY_KEY  = 'army-hr-token-expiry'
const EMAIL_KEY   = 'army-hr-email'

// Buffer: treat the token as expired 5 min before it actually expires
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

function isTokenFresh(expiry: number): boolean {
  return Date.now() < expiry - EXPIRY_BUFFER_MS
}

export interface AuthState {
  token: string | null
  userEmail: string | null
  isSignedIn: boolean
  signIn: () => void
  signOut: () => void
  setToken: (token: string, expiresIn: number, email?: string) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0)
    return stored && isTokenFresh(expiry) ? stored : null
  })

  const [userEmail, setUserEmail] = useState<string | null>(
    () => localStorage.getItem(EMAIL_KEY)
  )

  const signIn = () => { /* implemented in useGoogleAuth hook */ }

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)
    localStorage.removeItem(EMAIL_KEY)
    setTokenState(null)
    setUserEmail(null)
  }

  const setToken = (t: string, expiresIn: number, email?: string) => {
    const expiry = Date.now() + expiresIn * 1000
    localStorage.setItem(TOKEN_KEY, t)
    localStorage.setItem(EXPIRY_KEY, String(expiry))
    if (email) {
      localStorage.setItem(EMAIL_KEY, email)
      setUserEmail(email)
    }
    setTokenState(t)
  }

  return (
    <AuthContext.Provider value={{ token, userEmail, isSignedIn: !!token, signIn, signOut, setToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// Read stored email without a React component — used for silent refresh before mount
export function getStoredEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY)
}

export function hasExpiredToken(): boolean {
  const stored = localStorage.getItem(TOKEN_KEY)
  const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0)
  return !!stored && !isTokenFresh(expiry)
}
