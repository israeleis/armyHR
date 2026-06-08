import { describe, it, expect } from 'vitest'
import { STATUS_MAP, lookupStatus, ALL_STATUSES, UNKNOWN_STATUS } from '../statusVocabulary'

describe('statusVocabulary', () => {
  it('has exactly 12 statuses', () => {
    expect(ALL_STATUSES).toHaveLength(12)
  })

  it('every status has code, label, bg, fg', () => {
    for (const s of ALL_STATUSES) {
      expect(s.code).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.bg).toMatch(/^#/)
      expect(s.fg).toMatch(/^#/)
    }
  })

  it('lookupStatus returns correct entry for known codes', () => {
    expect(lookupStatus('נ').label).toBe('נוכח')
    expect(lookupStatus('חול').label).toBe('חול')
    expect(lookupStatus('יח').label).toBe('יוצא-חוזר')
    expect(lookupStatus('ל').label).toBe('לשחרר היום')
  })

  it('lookupStatus trims whitespace', () => {
    expect(lookupStatus(' נ ').label).toBe('נוכח')
  })

  it('lookupStatus returns UNKNOWN_STATUS for unknown code', () => {
    expect(lookupStatus('xyz')).toBe(UNKNOWN_STATUS)
    expect(lookupStatus('')).toBe(UNKNOWN_STATUS)
  })

  it('all codes in STATUS_MAP match their own code field', () => {
    for (const [key, def] of Object.entries(STATUS_MAP)) {
      expect(def.code).toBe(key)
    }
  })
})
