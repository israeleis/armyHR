import type { SoldierFields } from '@/domain/types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface MultiSelectSection {
  key: string
  label: string
  type: 'multiselect'
  options: string[]
}

export interface TextSection {
  key: string
  label: string
  type: 'text'
}

export type FilterSection = MultiSelectSection | TextSection

export interface FilterState {
  multiSelect: Record<string, Set<string>>
  text: Record<string, string>
}

// ── State helpers ──────────────────────────────────────────────────────────

export function emptyFilterState(): FilterState {
  return { multiSelect: {}, text: {} }
}

export function isFilterActive(state: FilterState): boolean {
  return Object.values(state.multiSelect).some(s => s.size > 0) ||
    Object.values(state.text).some(t => t.trim().length > 0)
}

export function activeFilterCount(state: FilterState): number {
  let n = 0
  for (const s of Object.values(state.multiSelect)) if (s.size > 0) n++
  for (const t of Object.values(state.text)) if (t.trim()) n++
  return n
}

export function toggleMultiSelect(state: FilterState, key: string, value: string): FilterState {
  const prev = state.multiSelect[key] ?? new Set<string>()
  const next = new Set(prev)
  next.has(value) ? next.delete(value) : next.add(value)
  return { ...state, multiSelect: { ...state.multiSelect, [key]: next } }
}

export function clearMultiKey(state: FilterState, key: string): FilterState {
  return { ...state, multiSelect: { ...state.multiSelect, [key]: new Set() } }
}

export function setTextFilter(state: FilterState, key: string, value: string): FilterState {
  return { ...state, text: { ...state.text, [key]: value } }
}

// ── Build sections from soldier data ───────────────────────────────────────

const MULTISELECT_THRESHOLD = 25

function distinctValues(soldiers: SoldierFields[], getter: (s: SoldierFields) => string | undefined): string[] {
  return [...new Set(soldiers.map(getter).filter((v): v is string => !!v))].sort()
}

export function buildFilterSections(soldiers: SoldierFields[]): FilterSection[] {
  const sections: FilterSection[] = []

  // Free-text: name
  sections.push({ key: 'name', label: 'שם', type: 'text' })

  // Free-text: id (only if distinct from name)
  if (soldiers.some(s => s.id && s.id !== s.name)) {
    sections.push({ key: 'id', label: 'מ״א', type: 'text' })
  }

  // Known categorical fields
  const known: Array<{ key: keyof SoldierFields; label: string }> = [
    { key: 'rank', label: 'דרגה' },
    { key: 'unit', label: 'יחידה' },
    { key: 'team', label: 'כיתה' },
    { key: 'role', label: 'תפקיד' },
  ]
  for (const { key, label } of known) {
    const values = distinctValues(soldiers, s => s[key] as string | undefined)
    if (values.length === 0) continue
    sections.push(
      values.length <= MULTISELECT_THRESHOLD
        ? { key, label, type: 'multiselect', options: values }
        : { key, label, type: 'text' }
    )
  }

  // Extra (dynamic) columns
  const extraKeys = new Set<string>()
  for (const s of soldiers) for (const k of Object.keys(s.extra)) extraKeys.add(k)
  for (const key of [...extraKeys].sort()) {
    const values = distinctValues(soldiers, s => s.extra[key])
    if (values.length === 0) continue
    sections.push(
      values.length <= MULTISELECT_THRESHOLD
        ? { key: `extra:${key}`, label: key, type: 'multiselect', options: values }
        : { key: `extra:${key}`, label: key, type: 'text' }
    )
  }

  return sections
}

// ── Apply filter to a soldier list ─────────────────────────────────────────

export function applySoldierFilter(soldiers: SoldierFields[], state: FilterState): SoldierFields[] {
  if (!isFilterActive(state)) return soldiers

  return soldiers.filter(s => {
    // Text filters — split by spaces, ALL parts must appear in the field value
    for (const [key, text] of Object.entries(state.text)) {
      if (!text.trim()) continue
      const parts = text.toLowerCase().trim().split(/\s+/)
      const val = getSoldierValue(s, key).toLowerCase()
      if (!parts.every(p => val.includes(p))) return false
    }
    // Multi-select filters
    for (const [key, selected] of Object.entries(state.multiSelect)) {
      if (selected.size === 0) continue
      if (!selected.has(getSoldierValue(s, key))) return false
    }
    return true
  })
}

function getSoldierValue(s: SoldierFields, key: string): string {
  if (key.startsWith('extra:')) return s.extra[key.slice(6)] ?? ''
  return ((s as unknown as Record<string, unknown>)[key] as string | undefined) ?? ''
}

// ── Serialization (Set ↔ string[] for JSON/sheet storage) ─────────────────

export interface SerializedFilterState {
  multiSelect: Record<string, string[]>
  text: Record<string, string>
}

export function serializeFilterState(state: FilterState): string {
  const s: SerializedFilterState = {
    multiSelect: Object.fromEntries(
      Object.entries(state.multiSelect).map(([k, v]) => [k, [...v]])
    ),
    text: { ...state.text },
  }
  return JSON.stringify(s)
}

export function deserializeFilterState(json: string): FilterState {
  const s = JSON.parse(json) as SerializedFilterState
  return {
    multiSelect: Object.fromEntries(
      Object.entries(s.multiSelect ?? {}).map(([k, v]) => [k, new Set(v)])
    ),
    text: s.text ?? {},
  }
}

// ── URL encoding (base64 JSON, for shared deep links) ─────────────────────

export function encodeFilterState(state: FilterState): string {
  return btoa(unescape(encodeURIComponent(serializeFilterState(state))))
}

export function decodeFilterState(encoded: string): FilterState | null {
  try {
    return deserializeFilterState(decodeURIComponent(escape(atob(encoded))))
  } catch {
    return null
  }
}
