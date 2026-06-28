# Diary Screen Group-By — Design Spec

**Date:** 2026-06-28

---

## Problem

`DiaryScreen` (`/diary`) shows a flat preview of 6 soldiers for the selected date. Commanders need to see the full personnel list broken down by unit, team, rank, or status — matching the group-by capability already available in SoldiersScreen and TransitionsScreen.

---

## Design

### Group-by options

Four keys, added inside the existing `FilterPane` via `GroupBySection`:

| Key | Label |
|-----|-------|
| `unit` | יחידה |
| `team` | צוות |
| `rank` | דרגה |
| `status` | סטטוס |

"סטטוס" groups by the status category label (נוכח / בדרכים / גימלים / בבית בתשלום / משוחרר / אחר / ללא סטטוס) using the same STATUS_GROUPS logic already in `DailyDetailScreen`.

### Personnel list behaviour

- **No group-by active** → current flat preview: up to 6 soldiers, "הכל (N) ←" link if more
- **Group-by active** → full list, filter applied first, then grouped into collapsible `CollapsibleSection` blocks. No 6-item cap.
- Each `CollapsibleSection` shows: group label + count badge. Clicking the header toggles open/collapsed. All sections start collapsed.
- Within each section, soldiers are sorted by name.
- The donut summary card and stat boxes remain unchanged (they already reflect the filtered set).

### Filter badge

Filter icon badge count includes active group-by key count, matching SoldiersScreen:
```
filterCount + groupByKeys.length
```

### State

- `groupByKeys: GroupByKey[]` — managed by `useGroupBy<GroupByKey>()` hook (already in `@/features/filters/groupBy`)
- `expanded: Set<string>` — from the same hook
- Clear group-by when "נקה הכל" is tapped in FilterPane (call `resetGroupBy()`)

---

## Files Affected

| File | Change |
|------|--------|
| `src/features/diary/DiaryScreen.tsx` | Add group-by state, `GroupBySection` in FilterPane, replace flat preview with grouped collapsible list when active |

---

## What Is NOT Changed

- `DailyDetailScreen` — already has its own hardcoded status grouping, untouched
- `FilterPane` component — no changes
- `groupBy.ts` / `GroupBySection.tsx` — reused as-is
- Donut chart and stat boxes in DiaryScreen — unchanged
- Date carousel — unchanged
