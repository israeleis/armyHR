# Global Header, Sidebar & Theme Toggle — Design Spec

**Date:** 2026-06-08  
**Status:** Approved

---

## Overview

Replace the per-screen ad-hoc header buttons with a unified global app shell: a sticky header containing a hamburger, sheet name, and day/night toggle; a right-side drawer sidebar for sheet history management and sign-out; and a full light/dark theme system.

---

## Architecture

**Approach:** Option A — `AppLayout` local state + `useTheme` hook. No new React contexts. Sidebar open/close is local to `AppLayout`. Theme is a self-contained hook.

### New files

| File | Purpose |
|---|---|
| `src/components/AppHeader.tsx` | Global sticky header: hamburger · sheet name · theme toggle |
| `src/components/Sidebar.tsx` | Right-side drawer with sheet history list + modal + exit |
| `src/hooks/useTheme.ts` | Read/write `army-hr-theme` in localStorage, flip `.light` on `<html>` |
| `src/hooks/useSheetHistory.ts` | Read/write `army-hr-sheet-history` in localStorage (ordered array) |

### Modified files

| File | Change |
|---|---|
| `src/router.tsx` | `AppLayout` gains `sidebarOpen` state, renders `AppHeader` + `Sidebar` + dim overlay |
| `src/features/diary/DiaryScreen.tsx` | Remove "שנה גיליון" / "יציאה" buttons; simplify/remove per-screen header |
| `src/features/sheet-picker/SheetPickerScreen.tsx` | Call `addSheet()` from `useSheetHistory` on sheet select |
| `src/styles/globals.css` | Add `.light` class overriding CSS variables; keep `:root` as dark default |

### AppLayout structure

```
AppLayout
├── AppHeader  (hamburger · sheet name · theme toggle)
├── Sidebar    (z-50, slides from right, 78% width)
│   ├── "גיליונות שנפתחו" header
│   ├── scrollable sheet list (active highlighted, others have trash → modal)
│   ├── "בחר גיליון חדש" → navigate('/sheets')
│   └── "יציאה" → signOut() + navigate('/signin')
├── dim overlay  (when sidebarOpen, click to close)
├── OfflineBadge
├── <Outlet />
└── BottomNav
```

---

## Data & State

### `useSheetHistory` — `army-hr-sheet-history` (localStorage)

```ts
interface SheetEntry { id: string; name: string }

// addSheet: prepend, dedupe by id, cap at 20
// removeSheet: remove by id
// history: SheetEntry[]
```

- Called in `SheetPickerScreen` when user picks a sheet.
- Also called in `Sidebar` when user switches to a cached sheet.
- Independent of `army-hr-sheet` (currently-active sheet key — unchanged).

### `useTheme` — `army-hr-theme` (localStorage)

```ts
type Theme = 'dark' | 'light'

// toggleTheme: flip, persist to localStorage, update document.documentElement classList
// theme: 'dark' | 'light'
// Initializes from localStorage on mount, defaults to 'dark'
```

Applies `.light` class to `document.documentElement`. CSS vars in `.light {}` override `:root {}`.

---

## Components

### `AppHeader`

- Height 52px, `sticky top-0 z-40`, `bg-surface-container border-b border-outline-variant`
- RTL layout (3 sections):
  - **Right (start):** hamburger icon (`☰`) or close (`✕`) when sidebar is open — `text-primary`
  - **Center:** current sheet name (from `getSelectedSheet()`), bold, truncated — `text-on-surface`
  - **Left (end):** sun `☀` / moon `☾` icon depending on current theme — `text-primary`
- Hamburger click: toggles `sidebarOpen` in parent `AppLayout` (callback prop)
- Theme toggle click: calls `toggleTheme()` from `useTheme`

### `Sidebar`

- Fixed positioned, `top-[52px] right-0 bottom-0 w-[78%] max-w-[320px]`
- `z-50`, `bg-surface-container border-l border-outline-variant`
- CSS transition: `translate-x-0` when open, `translate-x-full` when closed
- **Sheet list (scrollable flex-1):**
  - Active sheet: `bg-primary-container text-primary`, no trash icon
  - Other sheets: `bg-surface-high text-on-surface-variant`, trash icon on left (44px tap target)
  - Clicking inactive sheet: calls `addSheet()` + `setSelectedSheet()` + closes sidebar + navigates to `/diary`
- **Trash → modal:** sets `removeTarget` state; renders `ConfirmModal`
- **Footer:**
  - "בחר גיליון חדש" → `navigate('/sheets')`, closes sidebar
  - "יציאה" → `signOut()`, closes sidebar
- Clicking dim overlay closes sidebar

### `ConfirmModal`

- Inline component inside `Sidebar`
- Rendered when `removeTarget !== null`
- Props equivalent: `message`, `onConfirm`, `onCancel`
- Centered modal over a full-screen scrim
- Two buttons: "הסר" (error ghost) · "ביטול" (outline ghost)

---

## Light Theme

`.light` class on `<html>` element overrides `:root` dark vars:

```css
html.light {
  --color-surface:            #fafaf5;
  --color-surface-container:  #eeeee9;
  --color-surface-high:       #e3e3de;
  --color-on-surface:         #1a1c19;
  --color-on-surface-variant: #47483c;
  --color-primary:            #343c0a;
  --color-primary-container:  #4b5320;
  --color-on-primary-container: #bdc787;
  --color-outline:            #77786b;
  --color-outline-variant:    #c8c7b8;
  --color-error:              #ba1a1a;
  --color-error-container:    #ffdad6;
  color-scheme: light;
}
```

---

## Behaviour Notes

- The dim overlay is a `div` with `fixed inset-0 bg-black/60 z-40` rendered when `sidebarOpen === true`, click closes sidebar.
- `AppHeader` sits at `z-40`; sidebar at `z-50`; modal at `z-60`.
- Sidebar slides in with CSS `transition-transform duration-200`.
- `useTheme` applies the class immediately on mount to avoid flash of wrong theme.
- The existing `DiaryScreen` header is simplified (title only, no action buttons); other screens that had no header are unchanged.
