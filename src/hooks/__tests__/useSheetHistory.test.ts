import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSheetHistory, type SheetEntry } from '../useSheetHistory'

const HISTORY_KEY = 'army-hr-sheet-history'

beforeEach(() => localStorage.clear())

const makeSheet = (n: number): SheetEntry => ({ id: `id-${n}`, name: `Sheet ${n}`, tabName: `Tab ${n}`, readOnly: false })

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

  it('removeSheet removes by id + tabName', () => {
    const { result } = renderHook(() => useSheetHistory())
    act(() => { result.current.addSheet(makeSheet(1)) })
    act(() => { result.current.addSheet(makeSheet(2)) })
    act(() => { result.current.removeSheet('id-1', 'Tab 1') })
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
    act(() => { result.current.removeSheet('id-1', 'Tab 1') })
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
