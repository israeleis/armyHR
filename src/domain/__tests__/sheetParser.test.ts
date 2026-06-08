import { describe, it, expect } from 'vitest'
import { parseSheet } from '../sheetParser'

describe('parseSheet', () => {
  it('returns empty result for empty input', () => {
    const r = parseSheet([])
    expect(r.soldiers).toHaveLength(0)
    expect(r.statuses).toHaveLength(0)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('detects Hebrew name column alias "שם"', () => {
    const raw = [['שם', '01/06/2024'], ['דוד לוי', 'נ']]
    const r = parseSheet(raw)
    expect(r.soldiers[0].name).toBe('דוד לוי')
  })

  it('detects Hebrew id column alias "מספר אישי" (normalised)', () => {
    // note: space between words
    const raw = [['שם', 'מספר אישי', '01/06/2024'], ['אבי', '12345', 'נ']]
    const r = parseSheet(raw)
    expect(r.soldiers[0].id).toBe('12345')
  })

  it('detects date column in DD/MM format', () => {
    const raw = [['שם', '15/06'], ['חנן', 'ח']]
    const r = parseSheet(raw)
    expect(r.schema.dateColIndices.size).toBe(1)
    const date = [...r.schema.dateColIndices.values()][0]
    expect(date.getDate()).toBe(15)
    expect(date.getMonth()).toBe(5) // June = month 5
  })

  it('detects date column in DD/MM/YYYY format', () => {
    const raw = [['שם', '20/03/2024'], ['רחל', 'ב']]
    const r = parseSheet(raw)
    const date = [...r.schema.dateColIndices.values()][0]
    expect(date.getFullYear()).toBe(2024)
    expect(date.getDate()).toBe(20)
  })

  it('wide → long: produces correct number of StatusEntry objects', () => {
    // 2 soldiers, 3 date columns = 6 entries
    const raw = [
      ['שם', '01/06', '02/06', '03/06'],
      ['אלון', 'נ', 'י', 'ח'],
      ['מרים', 'ב', '', 'ג'],
    ]
    const r = parseSheet(raw)
    expect(r.soldiers).toHaveLength(2)
    expect(r.statuses).toHaveLength(6)
  })

  it('empty status cell is stored as empty string (not UNKNOWN_STATUS code)', () => {
    const raw = [['שם', '01/06'], ['עמי', '']]
    const r = parseSheet(raw)
    expect(r.statuses[0].code).toBe('')
  })

  it('sourceCell row and col are correct for each StatusEntry', () => {
    const raw = [
      ['שם', '01/06', '02/06'],
      ['אלון', 'נ', 'י'],
    ]
    const r = parseSheet(raw)
    // header at row 0, data at row 1; date cols at 1, 2
    const entryRow = r.statuses[0].sourceCell.row
    expect(entryRow).toBe(1)
    const cols = r.statuses.map(s => s.sourceCell.col).sort()
    expect(cols).toEqual([1, 2])
  })

  it('falls back to name as soldierId when no id column', () => {
    const raw = [['שם', '01/06'], ['יוסי', 'נ']]
    const r = parseSheet(raw)
    expect(r.statuses[0].soldierId).toBe('יוסי')
  })

  it('uses id column as soldierId when present', () => {
    const raw = [['שם', 'מא', '01/06'], ['יוסי', '999', 'נ']]
    const r = parseSheet(raw)
    expect(r.statuses[0].soldierId).toBe('999')
  })

  it('unknown headers go to soldier.extra', () => {
    const raw = [['שם', 'מחסן', '01/06'], ['שרה', 'נשק-01', 'נ']]
    const r = parseSheet(raw)
    expect(r.soldiers[0].extra['מחסן']).toBe('נשק-01')
  })

  it('blank rows are skipped', () => {
    const raw = [['שם', '01/06'], ['דוד', 'נ'], ['', ''], ['חנה', 'ב']]
    const r = parseSheet(raw)
    expect(r.soldiers).toHaveLength(2)
  })

  it('extra blank cols at end of header row are ignored', () => {
    const raw = [['שם', '01/06', '', ''], ['דוד', 'נ', '', '']]
    const r = parseSheet(raw)
    expect(r.schema.extraColIndices.size).toBe(0)
  })
})
