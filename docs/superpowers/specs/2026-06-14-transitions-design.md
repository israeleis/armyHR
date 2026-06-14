# פתיחות וסגירות — Design Spec

**Date:** 2026-06-14
**Status:** Approved

## Overview

A new navigation view showing soldiers whose paid-status transitions on each day:
- **פתיחה** — soldier is paid today and was not paid (or absent) the day before
- **סגירה** — soldier is paid today and will not be paid (or absent) the day after
- **Both** — soldier is paid for exactly one day (previous and next are both unpaid); shown as a single row with both chips

---

## Data Layer

**File:** `src/features/transitions/useTransitions.ts`

Consumes `useDiaryData()` — the same hook used by the diary screen, no additional API calls.

### TransitionEntry type

```ts
interface TransitionEntry {
  soldier: SoldierFields
  date: Date
  dateKey: string                    // ISO "YYYY-MM-DD"
  types: ('פתיחה' | 'סגירה')[]     // one or both
  statusCode: string                 // the paid status code on this day
}
```

### Derivation logic (per soldier × date in carousel range)

1. If today's status is not `isPaid` → skip
2. Look up yesterday's status: if missing **or** not `isPaid` → push `'פתיחה'`
3. Look up tomorrow's status: if missing **or** not `isPaid` → push `'סגירה'`
4. If `types` is empty → skip (paid both sides, not a boundary)
5. Emit one `TransitionEntry` regardless of how many types

Missing status record = unpaid (soldier was not in a paid status that day).

Returns `TransitionEntry[]` sorted by `dateKey` ascending, then soldier name.

---

## UI

**File:** `src/features/transitions/TransitionsScreen.tsx`

### Date carousel

Same ±7-day carousel as the diary (today highlighted, RTL). Selecting a date scrolls/filters to that date's section.

### Sections (one per date in range)

- Date header always renders, even when empty
- When empty: a muted "אין פעולות" row instead of hiding the section
- Header shows count of transitions for that date (0 when empty)

### Entry row (per TransitionEntry)

| Element | Detail |
|---|---|
| Primary line | Soldier name + rank |
| Secondary line | Unit / team |
| Type chips | `פתיחה` in green, `סגירה` in red — one or both side by side |
| Status | Status name for that day (e.g. נוכח, תשלום) |

---

## Filters & Group-by

**Modified file:** `src/features/filters/index.ts`

### New column: `transitionType`

- Label: `סוג פעולה`
- Type: multiselect, fixed values: `['פתיחה', 'סגירה']`
- Match rule: an entry with `types: ['פתיחה', 'סגירה']` matches either selected value

### Group-by `transitionType`

Within each date section, entries are grouped into "פתיחות" and "סגירות" sub-sections. Entries with both types appear in both groups.

### Other available filter columns

`unit`, `team`, `role`, `rank`, `name` — passed through from `SoldierFields`, same as diary/soldiers views.

---

## Navigation

**Modified file:** `src/components/Sidebar.tsx`

- Icon: swap/transfer icon (two arrows)
- Label: `פתיחות וסגירות`
- Route: `/transitions`

**Modified file:** `src/router.tsx`

- Add `{ path: 'transitions', element: <TransitionsScreen /> }` under the protected `AppLayout` children

---

## File Summary

| File | Change |
|---|---|
| `src/features/transitions/useTransitions.ts` | New — derivation hook |
| `src/features/transitions/TransitionsScreen.tsx` | New — screen component |
| `src/features/filters/index.ts` | Add `transitionType` column |
| `src/components/Sidebar.tsx` | Add nav item |
| `src/router.tsx` | Add route |
