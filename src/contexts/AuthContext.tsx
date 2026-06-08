import { createContext, useContext, useState, type ReactNode } from 'react'

export interface AuthState {
  token: string | null
  userEmail: string | null
  isSignedIn: boolean
  signIn: () => void      // stub — implemented in Task E
  signOut: () => void
  setToken: (token: string) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const signIn = () => { /* implemented in useGoogleAuth hook in Task E */ }
  const signOut = () => { setToken(null); setUserEmail(null) }

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
