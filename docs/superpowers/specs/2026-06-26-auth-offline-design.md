# Auth & Offline Mode — Design Spec

**Date:** 2026-06-26

---

## Problem

Two related failures in the current auth flow:

1. **Re-sign-in on every session** — `useDiaryData` calls `signOut()` on a 401. `signOut()` clears the stored email. On the next app load, `AppLayout` has no email to pass to `silentRefresh`, so it skips silent refresh and redirects to `/signin`.

2. **Offline blocks entry** — Even when `navigator.onLine` is false, the router guard `if (isOnline && !isSignedIn) return <Navigate to="/signin" replace />` sometimes redirects (e.g. on WiFi with no internet: `navigator.onLine = true`, silent refresh fails, redirect fires). Users with cached data are blocked from seeing it.

---

## Decision Flow

```
App loads — does localStorage have a stored email?
│
├── No  →  /signin   (first-time user or explicit sign-out)
│
└── Yes →  is navigator.onLine true?
           │
           ├── No  →  show app (offline mode, cached data, sync disabled)
           │
           └── Yes →  silentRefresh(email)
                      │
                      ├── OK    →  show app (signed in, full sync)
                      │
                      └── FAIL  →  /signin
```

---

## Changes

### 1. `src/contexts/AuthContext.tsx`

Add `clearToken()`:
```ts
const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRY_KEY)
  setTokenState(null)
  // email is intentionally kept — silent refresh needs it
}
```

Export it on `AuthState` interface and `AuthContext.Provider` value.

### 2. `src/features/diary/useDiaryData.ts`

Replace `signOut()` with `clearToken()` on 401. This preserves the email so the next app load can attempt silent refresh.

```ts
const { token, clearToken } = useAuth()
...
if (query.error && String(query.error).includes('401')) {
  clearToken()
}
```

### 3. `src/router.tsx` — `AppLayout`

Replace the current `refreshFailed` state machine with this logic:

```
On mount:
  if (isSignedIn)          → ready (nothing to do)
  else if (!hasSession)    → redirect to /signin immediately (no stored email)
  else if (!isOnline)      → ready (offline mode, token stays null)
  else                     → attempt silentRefresh(userEmail)
                               OK   → ready
                               FAIL → redirect to /signin
```

`hasSession` = `!!userEmail` (email stored in localStorage from a previous sign-in).

The "מתחבר..." splash is shown only while `silentRefresh` is in flight (online path). Offline path resolves synchronously — no splash needed.

The existing redirect guard `if (isOnline && !isSignedIn) return <Navigate to="/signin" replace />` is **removed**. The `useEffect` handles all redirect decisions; the render path only shows the app or the loading spinner.

### 4. Offline UX

When the user enters offline (token = null):
- `useDiaryData` already falls back to the IndexedDB snapshot — no change needed.
- The sync chip in `AppHeader` already shows `WifiOffIcon` when `!isOnline` — no change needed.
- Write edits are queued in IndexedDB and sync when back online — no change needed.

---

## What Is NOT Changed

- `silentRefresh` implementation in `useGoogleAuth.ts` — no changes.
- `triggerSignIn` (manual sign-in button on `SignInScreen`) — no changes.
- `signOut()` — still clears everything including email (explicit user action).
- `useDiaryData` offline cache fallback — already works, no changes.
- The 8-second `silentRefresh` timeout — kept as-is.

---

## Files Affected

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Add `clearToken()` to interface and provider |
| `src/features/diary/useDiaryData.ts` | Use `clearToken()` instead of `signOut()` on 401 |
| `src/router.tsx` | Rewrite `AppLayout` auth gate to implement the decision flow |
