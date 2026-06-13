import { createContext, useContext, useState, type ReactNode } from 'react'

const TOKEN_KEY = 'army-hr-token'
const EMAIL_KEY = 'army-hr-email'

export interface AuthState {
  token: string | null
  userEmail: string | null
  isSignedIn: boolean
  signIn: () => void
  signOut: () => void
  setToken: (token: string, email?: string) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY)
  )
  const [userEmail, setUserEmail] = useState<string | null>(
    () => localStorage.getItem(EMAIL_KEY)
  )

  const signIn = () => { /* implemented in useGoogleAuth hook */ }

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    setTokenState(null)
    setUserEmail(null)
  }

  const setToken = (t: string, email?: string) => {
    localStorage.setItem(TOKEN_KEY, t)
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
