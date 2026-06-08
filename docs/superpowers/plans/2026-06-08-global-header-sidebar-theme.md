# Global Header, Sidebar & Theme Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global sticky header (hamburger · sheet name · theme toggle), a right-side drawer sidebar (cached sheet list + exit), and a full dark/light theme system to the RTL Hebrew military HR app.

**Architecture:** Option A — `AppLayout` local state manages sidebar open/close; a `useTheme` hook handles dark/light via a `.light` class on `<html>`; a `useSheetHistory` hook persists a cached list of opened sheets in localStorage. New components live in `src/components/`; new hooks in `src/hooks/`.

**Tech Stack:** React 19, React Router v7, Tailwind CSS v4, Vitest + jsdom + @testing-library/react

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/hooks/useTheme.ts` | Read/write `army-hr-theme` localStorage key, apply `.light` class to `<html>` |
| Create | `src/hooks/useSheetHistory.ts` | Read/write `army-hr-sheet-history` localStorage key (ordered array, max 20, deduped) |
| Create | `src/hooks/__tests__/useTheme.test.ts` | Tests for useTheme |
| Create | `src/hooks/__tests__/useSheetHistory.test.ts` | Tests for useSheetHistory |
| Create | `src/components/AppHeader.tsx` | Sticky global header with hamburger, sheet name, theme toggle |
| Create | `src/components/Sidebar.tsx` | Drawer with sheet history list, remove modal, pick new, exit |
| Modify | `src/styles/globals.css` | Add missing dark CSS vars, add `html.light {}` overrides |
| Modify | `src/main.tsx` | Apply saved theme class before first render (prevent flash) |
| Modify | `src/router.tsx` | AppLayout adds sidebarOpen state, AppHeader, Sidebar |
| Modify | `src/features/sheet-picker/SheetPickerScreen.tsx` | Export `setSelectedSheet`, call `addSheet` on select |
| Modify | `src/features/diary/DiaryScreen.tsx` | Remove per-screen header; fix container height |

---

### Task 1: `useTheme` hook

**Files:**
- Create: `src/hooks/useTheme.ts`
- Create: `src/hooks/__tests__/useTheme.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useTheme.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/hooks/__tests__/useTheme.test.ts
```

Expected: FAIL — "Cannot find module '../useTheme'"

- [ ] **Step 3: Create `src/hooks/useTheme.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/hooks/__tests__/useTheme.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTheme.ts src/hooks/__tests__/useTheme.test.ts
git commit -m "feat(hooks): useTheme - dark/light toggle with localStorage persistence"
```

---

### Task 2: `useSheetHistory` hook

**Files:**
- Create: `src/hooks/useSheetHistory.ts`
- Create: `src/hooks/__tests__/useSheetHistory.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useSheetHistory.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSheetHistory, type SheetEntry } from '../useSheetHistory'

const HISTORY_KEY = 'army-hr-sheet-history'

beforeEach(() => localStorage.clear())

const makeSheet = (n: number): SheetEntry => ({ id: `id-${n}`, name: `Sheet ${n}` })

describe('useSheetHistory', () => {
  it('starts with empty history when nothing stored', () => {
    const { result } = renderHook(() => useSheetHistory())
    expect(result.current.history).toEqual([])
  })

  it('reads stored history from localStorage', () => {
    const stored = [makeSheet(1), makeSheet(2)]
    localStorage.setItem(HISTORY_KEY, JSON.stringify(stored))
    const { result } = renderHook(() => useSheetHistory())
    expect(result.current.history).toEqual(stored)
  })

  it('addSheet prepends to history', () => {
    const { result } = renderHook(() => useSheetHistory())
    act(() => { result.current.addSheet(makeSheet(1)) })
    act(() => { result.current.addSheet(makeSheet(2)) })
    expect(result.current.history[0]).toEqual(makeSheet(2))
    expect(result.current.history[1]).toEqual(makeSheet(1))
  })

  it('addSheet dedupes by id (moves existing to front)', () => {
    const { result } = renderHook(() => useSheetHistory())
    act(() => { result.current.addSheet(makeSheet(1)) })
    act(() => { result.current.addSheet(makeSheet(2)) })
    act(() => { result.current.addSheet(makeSheet(1)) }) // re-add sheet 1
    expect(result.current.history.length).toBe(2)
    expect(result.current.history[0]).toEqual(makeSheet(1))
  })

  it('addSheet caps at 20 entries', () => {
    const { result } = renderHook(() => useSheetHistory())
    for (let i = 1; i <= 22; i++) {
      act(() => { result.current.addSheet(makeSheet(i)) })
    }
    expect(result.current.history.length).toBe(20)
    expect(result.current.history[0]).toEqual(makeSheet(22))
  })

  it('removeSheet removes by id', () => {
    const { result } = renderHook(() => useSheetHistory())
    act(() => { result.current.addSheet(makeSheet(1)) })
    act(() => { result.current.addSheet(makeSheet(2)) })
    act(() => { result.current.removeSheet('id-1') })
    expect(result.current.history).toEqual([makeSheet(2)])
  })

  it('addSheet persists to localStorage', () => {
    const { result } = renderHook(() => useSheetHistory())
    act(() => { result.current.addSheet(makeSheet(1)) })
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY)!)
    expect(stored).toEqual([makeSheet(1)])
  })

  it('removeSheet persists to localStorage', () => {
    const { result } = renderHook(() => useSheetHistory())
    act(() => { result.current.addSheet(makeSheet(1)) })
    act(() => { result.current.removeSheet('id-1') })
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY)!)
    expect(stored).toEqual([])
  })

  it('refresh re-reads latest localStorage state', () => {
    const { result } = renderHook(() => useSheetHistory())
    // another "instance" writes directly to localStorage
    localStorage.setItem(HISTORY_KEY, JSON.stringify([makeSheet(99)]))
    act(() => { result.current.refresh() })
    expect(result.current.history).toEqual([makeSheet(99)])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/hooks/__tests__/useSheetHistory.test.ts
```

Expected: FAIL — "Cannot find module '../useSheetHistory'"

- [ ] **Step 3: Create `src/hooks/useSheetHistory.ts`**

```ts
import { useState } from 'react'

export interface SheetEntry { id: string; name: string }

const HISTORY_KEY = 'army-hr-sheet-history'
const MAX_HISTORY = 20

function readHistory(): SheetEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeHistory(entries: SheetEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
}

export function useSheetHistory() {
  const [history, setHistory] = useState<SheetEntry[]>(readHistory)

  const addSheet = (sheet: SheetEntry) => {
    const next = [sheet, ...history.filter(s => s.id !== sheet.id)].slice(0, MAX_HISTORY)
    writeHistory(next)
    setHistory(next)
  }

  const removeSheet = (id: string) => {
    const next = history.filter(s => s.id !== id)
    writeHistory(next)
    setHistory(next)
  }

  const refresh = () => setHistory(readHistory())

  return { history, addSheet, removeSheet, refresh }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/hooks/__tests__/useSheetHistory.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSheetHistory.ts src/hooks/__tests__/useSheetHistory.test.ts
git commit -m "feat(hooks): useSheetHistory - cached sheet list with add/remove"
```

---

### Task 3: CSS variables for theming

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Replace `src/styles/globals.css` content**

Tailwind v4 generates `--color-{name}` CSS variables from `tailwind.config.ts`. Overriding those variables in `html.light {}` changes what every `bg-*` / `text-*` utility resolves to. The dark values below match the current `tailwind.config.ts` exactly — they are explicit so `html.light` overrides work correctly.

```css
@import "tailwindcss";

/* ── Dark theme (default) ─────────────────────────────── */
:root {
  --color-surface:                #131313;
  --color-surface-dim:            #131313;
  --color-surface-bright:         #393939;
  --color-surface-lowest:         #0e0e0e;
  --color-surface-low:            #1c1b1b;
  --color-surface-container:      #201f1f;
  --color-surface-high:           #2a2a2a;
  --color-surface-highest:        #353534;
  --color-on-surface:             #e5e2e1;
  --color-on-surface-variant:     #c8c7b8;
  --color-outline:                #919283;
  --color-outline-variant:        #47483c;
  --color-primary:                #c3cc8c;
  --color-on-primary:             #2d3404;
  --color-primary-container:      #4b5320;
  --color-on-primary-container:   #bdc787;
  --color-error:                  #ffb4ab;
  --color-on-error:               #690005;
  --color-error-container:        #93000a;
  --color-background:             #131313;
  --color-on-background:          #e5e2e1;
  color-scheme: dark;
}

/* ── Light theme override ─────────────────────────────── */
html.light {
  --color-surface:                #fafaf5;
  --color-surface-dim:            #dadad5;
  --color-surface-bright:         #fafaf5;
  --color-surface-lowest:         #ffffff;
  --color-surface-low:            #f4f4ef;
  --color-surface-container:      #eeeee9;
  --color-surface-high:           #e3e3de;
  --color-surface-highest:        #ddddd5;
  --color-on-surface:             #1a1c19;
  --color-on-surface-variant:     #47483c;
  --color-outline:                #77786b;
  --color-outline-variant:        #c8c7b8;
  --color-primary:                #343c0a;
  --color-on-primary:             #ffffff;
  --color-primary-container:      #4b5320;
  --color-on-primary-container:   #bdc787;
  --color-error:                  #ba1a1a;
  --color-on-error:               #ffffff;
  --color-error-container:        #ffdad6;
  --color-background:             #fafaf5;
  --color-on-background:          #1a1c19;
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

body {
  font-family: "Public Sans", system-ui, sans-serif;
  background-color: var(--color-surface);
  color: var(--color-on-surface);
  direction: rtl;
  -webkit-font-smoothing: antialiased;
}

/* Minimum touch target for glove/vehicle use — standalone elements only */
button,
[role="button"],
a:not(:where(p a, li a, span a)) {
  min-height: 44px;
  min-width: 44px;
}
```

- [ ] **Step 2: Verify the app still builds**

```bash
npx tsc -b --noEmit && npx vite build --mode development 2>&1 | tail -5
```

Expected: build succeeds with no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(theme): add CSS variable overrides for light/dark theming"
```

---

### Task 4: Prevent theme flash on reload

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Read current `src/main.tsx`**

```bash
cat src/main.tsx
```

- [ ] **Step 2: Add inline theme init before React render**

Add the theme class application at the top of `main.tsx`, before `ReactDOM.createRoot`. This runs synchronously before the first paint so there is no flash for light-mode users on reload.

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'

// Apply saved theme before first render to prevent flash of wrong theme
const savedTheme = localStorage.getItem('army-hr-theme')
if (savedTheme === 'light') {
  document.documentElement.classList.add('light')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

(Keep the existing imports intact — only add the 3 lines above `createRoot`.)

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat(theme): apply saved theme before React renders to prevent flash"
```

---

### Task 5: Export `setSelectedSheet` from SheetPickerScreen

**Files:**
- Modify: `src/features/sheet-picker/SheetPickerScreen.tsx`

The Sidebar needs to be able to activate a cached sheet without going through the picker flow. We expose a helper alongside the existing `getSelectedSheet`.

- [ ] **Step 1: Add `setSelectedSheet` export and call `addSheet` on select**

In `src/features/sheet-picker/SheetPickerScreen.tsx`, make two changes:

1. After the `getSelectedSheet` function, add:

```ts
export function setSelectedSheet(sheet: { id: string; name: string }) {
  localStorage.setItem(SELECTED_SHEET_KEY, JSON.stringify(sheet))
}
```

2. Update the `selectSheet` function inside the component to also record history:

```tsx
import { useSheetHistory } from '@/hooks/useSheetHistory'

// inside SheetPickerScreen component:
const { addSheet } = useSheetHistory()

function selectSheet(sheet: SheetFile) {
  const entry = { id: sheet.id, name: sheet.name }
  localStorage.setItem(SELECTED_SHEET_KEY, JSON.stringify(entry))
  addSheet(entry)
  navigate('/diary', { replace: true })
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/sheet-picker/SheetPickerScreen.tsx
git commit -m "feat(sheets): export setSelectedSheet helper, record history on pick"
```

---

### Task 6: `AppHeader` component

**Files:**
- Create: `src/components/AppHeader.tsx`

- [ ] **Step 1: Create `src/components/AppHeader.tsx`**

```tsx
import { useTheme } from '@/hooks/useTheme'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'

interface AppHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function AppHeader({ sidebarOpen, onToggleSidebar }: AppHeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const sheet = getSelectedSheet()

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-40 h-[52px] bg-surface-container border-b border-outline-variant flex items-center justify-between px-4"
    >
      {/* RIGHT (RTL start): hamburger or close */}
      <button
        onClick={onToggleSidebar}
        className="text-primary flex items-center justify-center w-[44px] h-[44px]"
        aria-label={sidebarOpen ? 'סגור תפריט' : 'פתח תפריט'}
      >
        {sidebarOpen ? <CloseIcon /> : <HamburgerIcon />}
      </button>

      {/* CENTER: current sheet name */}
      <span className="flex-1 text-center text-sm font-bold text-on-surface truncate px-2">
        {sheet?.name ?? 'ניהול כוח אדם'}
      </span>

      {/* LEFT (RTL end): theme toggle */}
      <button
        onClick={toggleTheme}
        className="text-primary flex items-center justify-center w-[44px] h-[44px]"
        aria-label={theme === 'dark' ? 'עבור למצב יום' : 'עבור למצב לילה'}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
    </header>
  )
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AppHeader.tsx
git commit -m "feat(ui): AppHeader - global sticky header with hamburger and theme toggle"
```

---

### Task 7: `Sidebar` component

**Files:**
- Create: `src/components/Sidebar.tsx`

- [ ] **Step 1: Create `src/components/Sidebar.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSheetHistory } from '@/hooks/useSheetHistory'
import { getSelectedSheet, setSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { history, addSheet, removeSheet, refresh } = useSheetHistory()
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null)
  const activeSheet = getSelectedSheet()

  // Re-read localStorage when drawer opens so sheets added via /sheets page appear
  useEffect(() => {
    if (open) refresh()
  }, [open])

  function handleSelectSheet(sheet: { id: string; name: string }) {
    addSheet(sheet)
    setSelectedSheet(sheet)
    onClose()
    navigate('/diary')
  }

  function handleConfirmRemove() {
    if (removeTarget) {
      removeSheet(removeTarget.id)
      setRemoveTarget(null)
    }
  }

  function handleExit() {
    signOut()
    onClose()
    navigate('/signin', { replace: true })
  }

  return (
    <>
      {/* Dim overlay — click to close */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 bg-black/60"
          style={{ top: '52px' }}
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        dir="rtl"
        className={[
          'fixed top-[52px] right-0 bottom-0 z-50',
          'w-[78%] max-w-[320px]',
          'bg-surface-container border-l border-outline-variant',
          'flex flex-col',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Section label */}
        <div className="px-4 pt-4 pb-2">
          <span className="text-[11px] font-mono font-bold text-primary uppercase tracking-wider">
            גיליונות שנפתחו
          </span>
        </div>

        {/* Sheet list */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1.5">
          {history.length === 0 && (
            <p className="text-xs text-on-surface-variant text-right px-1 py-3">
              אין גיליונות בהיסטוריה
            </p>
          )}
          {history.map(sheet => {
            const isActive = sheet.id === activeSheet?.id
            return (
              <div
                key={sheet.id}
                className={[
                  'flex items-center gap-2 rounded-md px-3',
                  isActive
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-high text-on-surface-variant',
                ].join(' ')}
              >
                <button
                  className="flex-1 text-sm font-medium text-right truncate min-w-0 py-2.5"
                  onClick={() => !isActive && handleSelectSheet(sheet)}
                  disabled={isActive}
                >
                  {sheet.name}
                </button>
                {isActive && (
                  <span className="text-[10px] font-mono shrink-0 opacity-60">✓ פעיל</span>
                )}
                {!isActive && (
                  <button
                    onClick={() => setRemoveTarget(sheet)}
                    className="shrink-0 flex items-center justify-center w-[36px] h-[44px] text-outline hover:text-error transition-colors"
                    aria-label={`הסר ${sheet.name}`}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer actions */}
        <div className="border-t border-outline-variant px-4 py-2">
          <button
            onClick={() => { navigate('/sheets'); onClose() }}
            className="w-full text-right text-sm font-bold text-primary py-3"
          >
            + בחר גיליון חדש
          </button>
          <button
            onClick={handleExit}
            className="w-full text-right text-sm font-bold text-error py-3"
          >
            יציאה
          </button>
        </div>
      </div>

      {/* Remove confirmation modal */}
      {removeTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
          dir="rtl"
        >
          <div className="bg-surface-high border border-outline-variant rounded-lg p-5 w-[80%] max-w-[300px] shadow-xl">
            <h3 className="text-sm font-bold text-on-surface mb-2">הסרת גיליון</h3>
            <p className="text-xs text-on-surface-variant mb-5">
              להסיר את &ldquo;{removeTarget.name}&rdquo; מהרשימה?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmRemove}
                className="text-sm font-bold text-error border border-error rounded-md px-4 py-2 hover:bg-error/10 transition-colors"
              >
                הסר
              </button>
              <button
                onClick={() => setRemoveTarget(null)}
                className="text-sm font-bold text-on-surface-variant border border-outline-variant rounded-md px-4 py-2 hover:bg-surface-high transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(ui): Sidebar drawer with sheet history, remove modal, and exit"
```

---

### Task 8: Wire `AppLayout` in router

**Files:**
- Modify: `src/router.tsx`

- [ ] **Step 1: Update `src/router.tsx`**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { createHashRouter, Outlet, Navigate } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
import { Sidebar } from '@/components/Sidebar'
import { BottomNav } from '@/components/BottomNav'
import { OfflineBadge } from '@/components/OfflineBadge'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { SheetPickerScreen } from '@/features/sheet-picker/SheetPickerScreen'
import { DiaryScreen } from '@/features/diary/DiaryScreen'
import { DailyDetailScreen } from '@/features/daily/DailyDetailScreen'
import { SoldierScreen } from '@/features/soldier/SoldierScreen'
import { TrendsScreen } from '@/features/trends/TrendsScreen'
import { ImportScreen } from '@/features/import/ImportScreen'

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
      />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <OfflineBadge />
      <div className="flex-1 flex flex-col pb-16">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}

export const router = createHashRouter([
  {
    path: '/',
    element: <Navigate to="/diary" replace />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { path: 'diary', element: <DiaryScreen /> },
      { path: 'diary/:date', element: <DailyDetailScreen /> },
      { path: 'soldier/:id', element: <SoldierScreen /> },
      { path: 'trends', element: <TrendsScreen /> },
      { path: 'import', element: <ImportScreen /> },
      { path: 'sheets', element: <SheetPickerScreen /> },
      { path: 'signin', element: <SignInScreen /> },
      { path: '*', element: <Navigate to="/diary" replace /> },
    ],
  },
])
```

- [ ] **Step 2: Build check**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/router.tsx
git commit -m "feat(layout): wire AppHeader and Sidebar into AppLayout"
```

---

### Task 9: Clean up `DiaryScreen`

**Files:**
- Modify: `src/features/diary/DiaryScreen.tsx`

Remove the per-screen header (lines 115–127 in the current file), remove unused `signOut` / `sheet` references, and fix the outer container so it fills the flex space from `AppLayout` correctly rather than claiming `h-screen`.

- [ ] **Step 1: Update `DiaryScreen.tsx`**

Make these targeted changes:

**Change 1** — imports: remove `getSelectedSheet` import (it's no longer used in DiaryScreen) and drop `signOut` from the `useAuth` destructure:

```tsx
// Before:
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
// ...
const { isSignedIn, signOut } = useAuth()
const sheet = getSelectedSheet()

// After: remove the getSelectedSheet import entirely.
// Change the useAuth line to:
const { isSignedIn } = useAuth()
// Remove: const sheet = getSelectedSheet()
```

**Change 2** — outer container: change `h-screen overflow-hidden` to `flex-1 flex flex-col overflow-hidden`:

```tsx
// Before:
<div dir="rtl" className="flex flex-col h-screen overflow-hidden bg-background">

// After:
<div dir="rtl" className="flex flex-col flex-1 overflow-hidden bg-background">
```

**Change 3** — remove the entire header block (the `<header>` element and its contents):

```tsx
// Remove this entire block (currently lines ~115-127):
{/* Header */}
<header className="sticky top-0 z-30 bg-surface-container border-b border-outline-variant px-4 py-3">
  <div className="flex items-center justify-between">
    <div className="text-right">
      <h1 className="text-headline-sm font-bold text-primary">ניהול כוח אדם</h1>
      {sheet && <p className="text-[11px] font-mono text-on-surface-variant truncate max-w-[200px]">{sheet.name}</p>}
    </div>
    <div className="flex items-center gap-2">
      <button onClick={() => navigate('/sheets')} className="text-xs text-on-surface-variant hover:text-primary px-2 py-1">שנה גיליון</button>
      <button onClick={signOut} className="text-xs text-error hover:opacity-80 px-2 py-1">יציאה</button>
    </div>
  </div>
</header>
```

- [ ] **Step 2: Build check**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/diary/DiaryScreen.tsx
git commit -m "refactor(diary): remove per-screen header, buttons moved to global sidebar"
```

---

### Task 10: Smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual verification checklist**

Open http://localhost:5173 and verify:

- [ ] Global header visible on all screens (Diary, Trends, Import, Sheets)
- [ ] Hamburger icon (☰) on the right side of header (RTL)
- [ ] Current sheet name appears in center of header (shows "ניהול כוח אדם" if no sheet selected)
- [ ] Sun/moon icon on the left side of header
- [ ] Clicking sun → switches to light theme (warm off-white background), icon changes to moon
- [ ] Reloading the page in light mode does not flash dark first
- [ ] Clicking moon → switches back to dark theme
- [ ] Clicking hamburger opens sidebar from right
- [ ] Dim overlay appears behind sidebar; clicking it closes sidebar
- [ ] Sidebar shows "אין גיליונות בהיסטוריה" when history empty
- [ ] Picking a sheet via /sheets adds it to sidebar history
- [ ] Sidebar sheet list scrolls when many sheets present
- [ ] Trash icon appears on non-active sheets; clicking it opens modal
- [ ] Modal shows sheet name; "ביטול" dismisses; "הסר" removes from list
- [ ] Active sheet has ✓ פעיל and no trash icon
- [ ] "+ בחר גיליון חדש" navigates to /sheets and closes sidebar
- [ ] "יציאה" signs out and redirects to /signin
- [ ] DiaryScreen has no "שנה גיליון" or "יציאה" buttons
- [ ] Unit filter chips still appear in DiaryScreen content (unchanged)

- [ ] **Step 3: Final commit if any last fixes needed**

```bash
git add -p   # stage only relevant changes
git commit -m "fix: smoke test adjustments"
```
