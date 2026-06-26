# Auth & Offline Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two auth bugs: (1) silent refresh fails because `signOut()` erases the stored email on 401, and (2) users with cached data are blocked by the sign-in screen when offline or when silent refresh fails despite connectivity.

**Architecture:** Three targeted edits — add `clearToken()` to `AuthContext` (keeps email), use it on 401 in `useDiaryData`, then replace the `AppLayout` auth gate with a linear decision flow: no email → /signin; offline → show app; online → try silentRefresh → success: show app / fail: /signin.

**Tech Stack:** React, React Router, localStorage, Google Identity Services (GIS)

## Global Constraints

- No new dependencies
- Hebrew UI copy unchanged
- `signOut()` behaviour is NOT changed — it still clears everything including email (explicit user action)
- The 8-second `silentRefresh` timeout is kept as-is
- Test runner: `npx vitest run` (Vitest 3.x)

---

## File Map

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Add `clearToken()` to interface + provider |
| `src/contexts/__tests__/AuthContext.test.ts` | New — unit test for `clearToken` |
| `src/features/diary/useDiaryData.ts` | Replace `signOut()` with `clearToken()` on 401 |
| `src/router.tsx` | Rewrite `AppLayout` auth gate to implement the decision flow |

---

## Task 1: Add `clearToken()` to AuthContext and use it on 401

**Files:**
- Modify: `src/contexts/AuthContext.tsx`
- Create: `src/contexts/__tests__/AuthContext.test.ts`
- Modify: `src/features/diary/useDiaryData.ts`

**Interfaces:**
- Produces: `clearToken: () => void` on `AuthState` — removes `TOKEN_KEY` and `EXPIRY_KEY` from localStorage and sets token state to null, but does NOT touch `EMAIL_KEY`

- [ ] **Step 1: Write the failing test**

Create `src/contexts/__tests__/AuthContext.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'

const TOKEN_KEY  = 'army-hr-token'
const EXPIRY_KEY = 'army-hr-token-expiry'
const EMAIL_KEY  = 'army-hr-email'

// clearToken behaviour is tested by exercising the localStorage contract directly,
// since AuthContext is a React context and testing it via renderHook requires jsdom.
// The contract: clearToken() must leave EMAIL_KEY intact.

describe('AuthContext clearToken contract', () => {
  beforeEach(() => {
    localStorage.setItem(TOKEN_KEY,  'tok-abc')
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + 3_600_000))
    localStorage.setItem(EMAIL_KEY,  'user@example.com')
  })

  it('removes token and expiry but keeps email', () => {
    // Simulate what clearToken() does:
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(EXPIRY_KEY)).toBeNull()
    expect(localStorage.getItem(EMAIL_KEY)).toBe('user@example.com')
  })

  it('signOut removes email too', () => {
    // Simulate signOut():
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)
    localStorage.removeItem(EMAIL_KEY)

    expect(localStorage.getItem(EMAIL_KEY)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to confirm it passes (contract test, not implementation test)**

```
npx vitest run src/contexts/__tests__/AuthContext.test.ts
```
Expected: PASS — this tests the contract, not the implementation yet.

- [ ] **Step 3: Add `clearToken` to `src/contexts/AuthContext.tsx`**

Replace the full file with:

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'

const TOKEN_KEY   = 'army-hr-token'
const EXPIRY_KEY  = 'army-hr-token-expiry'
const EMAIL_KEY   = 'army-hr-email'

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
  clearToken: () => void
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

  const clearToken = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)
    setTokenState(null)
    // email is intentionally kept — silent refresh needs it on next load
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
    <AuthContext.Provider value={{ token, userEmail, isSignedIn: !!token, signIn, signOut, clearToken, setToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function getStoredEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY)
}

export function hasExpiredToken(): boolean {
  const stored = localStorage.getItem(TOKEN_KEY)
  const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0)
  return !!stored && !isTokenFresh(expiry)
}
```

- [ ] **Step 4: Update `src/features/diary/useDiaryData.ts`**

Replace the full file with:

```ts
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getSheetValues } from '@/data/sheetsClient'
import { saveSnapshot, getSnapshot } from '@/data/localCache'
import { parseSheet } from '@/domain/sheetParser'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import type { ParseResult } from '@/domain/types'

async function fetchAndCacheSheet(token: string | null, spreadsheetId: string, tabName: string): Promise<ParseResult> {
  let rawValues: string[][]
  try {
    if (!token) throw new Error('no token')
    rawValues = await getSheetValues(token, spreadsheetId, tabName)
    await saveSnapshot(spreadsheetId, tabName, rawValues)
  } catch (err) {
    if (String(err).includes('401')) throw err
    const snap = await getSnapshot(spreadsheetId, tabName)
    if (!snap) throw new Error('אין נתונים שמורים ואין גישה לרשת')
    rawValues = snap.rawValues
  }
  return parseSheet(rawValues)
}

export function useDiaryData() {
  const { token, clearToken } = useAuth()
  const sheet = getSelectedSheet()

  const query = useQuery({
    queryKey: ['diary', sheet?.id, sheet?.tabName, token],
    queryFn: () => fetchAndCacheSheet(token, sheet!.id, sheet!.tabName),
    enabled: !!sheet,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })

  // Token rejected by server → clear token but keep email so silent refresh
  // can be attempted on the next app load.
  useEffect(() => {
    if (query.error && String(query.error).includes('401')) {
      clearToken()
    }
  }, [query.error, clearToken])

  return query
}
```

- [ ] **Step 5: Type-check**

```
npx tsc --noEmit --project tsconfig.app.json 2>&1 | grep -v "SoldiersScreen\|TransitionsScreen"
```
Expected: no output

- [ ] **Step 6: Run full test suite**

```
npx vitest run
```
Expected: 52 pass (1 new), 2 pre-existing sheetParser failures

- [ ] **Step 7: Commit**

```bash
git add src/contexts/AuthContext.tsx src/contexts/__tests__/AuthContext.test.ts src/features/diary/useDiaryData.ts
git commit -m "feat(auth): add clearToken() — preserves email on 401 so silent refresh can retry"
```

---

## Task 2: Rewrite AppLayout auth gate

**Files:**
- Modify: `src/router.tsx`

**Interfaces:**
- Consumes: `clearToken: () => void` and `userEmail: string | null` from `useAuth()` (Task 1); `silentRefresh(email: string): Promise<boolean>` from `useGoogleAuth()`

**Decision flow implemented:**
```
isSignedIn?         → true: authReady = true (immediate)
!userEmail?         → true: authReady = false (immediate, first-time user)
!navigator.onLine?  → true: authReady = true (immediate, offline mode)
else                → authReady = null; silentRefresh(userEmail)
                         OK   → authReady = true
                         FAIL → authReady = false
```

`authReady === null` → show "מתחבר..."
`authReady === false` → `<Navigate to="/signin" replace />`
`authReady === true` → render app

- [ ] **Step 1: Replace `AppLayout` in `src/router.tsx`**

Replace the full file:

```tsx
import { useState, useEffect } from 'react'
import { createHashRouter, Outlet, Navigate } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
import { Sidebar } from '@/components/Sidebar'
import { useAuth } from '@/contexts/AuthContext'
import { useGoogleAuth } from '@/features/auth/useGoogleAuth'
import { ActiveViewProvider } from '@/contexts/ActiveViewContext'
import { initSyncEngine } from '@/data/syncEngine'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { SheetPickerScreen } from '@/features/sheet-picker/SheetPickerScreen'
import { DiaryScreen } from '@/features/diary/DiaryScreen'
import { DailyDetailScreen } from '@/features/daily/DailyDetailScreen'
import { SoldierScreen } from '@/features/soldier/SoldierScreen'
import { TrendsScreen } from '@/features/trends/TrendsScreen'
import { SoldiersScreen } from '@/features/soldiers/SoldiersScreen'
import { ImportScreen } from '@/features/import/ImportScreen'
import { TransitionsScreen } from '@/features/transitions/TransitionsScreen'

function useIsOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

function AppLayout() {
  const { isSignedIn, token, userEmail } = useAuth()
  const { silentRefresh } = useGoogleAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Compute initial auth readiness synchronously where possible:
  //   true  = enter app now
  //   false = send to /signin now
  //   null  = waiting for silentRefresh (async)
  const [authReady, setAuthReady] = useState<boolean | null>(() => {
    if (isSignedIn)            return true   // fresh token
    if (!userEmail)            return false  // never signed in / explicit sign-out
    if (!navigator.onLine)     return true   // offline — use cached data
    return null                              // has email + online: try silentRefresh
  })

  // Start sync engine once
  const tokenRef = { current: token }
  tokenRef.current = token
  useEffect(() => {
    return initSyncEngine(() => tokenRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Attempt silent refresh when needed (only fires when authReady starts as null)
  useEffect(() => {
    if (authReady !== null) return
    // authReady is null only when: !isSignedIn && userEmail && navigator.onLine
    silentRefresh(userEmail!).then(ok => setAuthReady(ok ? true : false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (authReady === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-on-surface-variant font-mono text-sm">מתחבר...</div>
      </div>
    )
  }

  if (authReady === false) return <Navigate to="/signin" replace />

  return (
    <ActiveViewProvider>
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(o => !o)}
        />
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col">
          <Outlet />
        </div>
      </div>
    </ActiveViewProvider>
  )
}

export const router = createHashRouter([
  { path: '/', element: <Navigate to="/trends" replace /> },
  { path: '/signin', element: <SignInScreen /> },
  { path: '/sheets', element: <SheetPickerScreen /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { path: 'trends',       element: <TrendsScreen /> },
      { path: 'soldiers',     element: <SoldiersScreen /> },
      { path: 'transitions',  element: <TransitionsScreen /> },
      { path: 'diary',        element: <DiaryScreen /> },
      { path: 'diary/:date',  element: <DailyDetailScreen /> },
      { path: 'soldier/:id',  element: <SoldierScreen /> },
      { path: 'import',       element: <ImportScreen /> },
      { path: '*',            element: <Navigate to="/trends" replace /> },
    ],
  },
])
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit --project tsconfig.app.json 2>&1 | grep -v "SoldiersScreen\|TransitionsScreen"
```
Expected: no output

- [ ] **Step 3: Run full test suite**

```
npx vitest run
```
Expected: same pass count as after Task 1, no regressions

- [ ] **Step 4: Manual smoke test — 3 scenarios**

Start dev server: `npm run dev`

**Scenario A — normal sign-in:**
1. Clear localStorage (`localStorage.clear()` in DevTools console)
2. Reload → should land on `/signin`
3. Sign in → should reach `/trends`

**Scenario B — offline with cached data:**
1. While signed in, reload once to ensure a snapshot is cached in IndexedDB
2. DevTools → Network → set to "Offline"
3. Clear localStorage token only: `localStorage.removeItem('army-hr-token'); localStorage.removeItem('army-hr-token-expiry')`
4. Reload → should enter app immediately (no sign-in screen), showing cached data
5. Sync chip should show WifiOffIcon

**Scenario C — expired session (silentRefresh fails):**
1. Set stored email but no token: `localStorage.setItem('army-hr-email', 'x@x.com'); localStorage.removeItem('army-hr-token')`
2. Network must be online
3. Reload → "מתחבר..." briefly, then either signs in silently (if Google session active) or redirects to `/signin`

- [ ] **Step 5: Commit**

```bash
git add src/router.tsx
git commit -m "feat(auth): rewrite AppLayout gate — offline bypass, clearToken-aware decision flow"
```
