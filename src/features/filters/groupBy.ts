import { useState, useCallback, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GroupByOption {
  key: string
  label: string
}

// ── useGroupBy hook ────────────────────────────────────────────────────────

export function useGroupBy<K extends string>() {
  const [groupByKeys, setGroupByKeys] = useState<K[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => { setExpanded(new Set()) }, [groupByKeys])

  const toggleExpanded = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }, [])

  const addGroupKey    = useCallback((k: K) => setGroupByKeys(p => [...p, k]), [])
  const removeGroupKey = useCallback((k: K) => setGroupByKeys(p => p.filter(x => x !== k)), [])
  const moveGroupKey   = useCallback((idx: number, dir: -1 | 1) => setGroupByKeys(p => {
    const next = [...p]
    const to = idx + dir
    if (to < 0 || to >= next.length) return p
    ;[next[idx], next[to]] = [next[to], next[idx]]
    return next
  }), [])

  const reset = useCallback(() => { setGroupByKeys([]); setExpanded(new Set()) }, [])

  return { groupByKeys, setGroupByKeys, expanded, setExpanded, toggleExpanded, addGroupKey, removeGroupKey, moveGroupKey, reset }
}

// ── applyCollapse ──────────────────────────────────────────────────────────

export function applyCollapse<Item extends { type: string; depth: number; path?: string }>(
  items: Item[],
  expanded: Set<string>,
): Array<Item & { isExpanded?: boolean }> {
  const result: Array<Item & { isExpanded?: boolean }> = []
  let collapsedDepth: number | null = null

  for (const item of items) {
    if (collapsedDepth !== null) {
      if (item.type === 'header' && item.depth <= collapsedDepth) collapsedDepth = null
      else continue
    }
    if (item.type === 'header') {
      const isExpanded = expanded.has(item.path ?? '')
      result.push({ ...item, isExpanded })
      if (!isExpanded) collapsedDepth = item.depth
    } else {
      result.push(item)
    }
  }
  return result
}
