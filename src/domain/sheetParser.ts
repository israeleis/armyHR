import { parse, isValid } from 'date-fns'
import type { CellCoord, ParseResult, SheetSchema, SoldierFields, StatusEntry } from './types'

// Canonical field aliases (normalised: lowercase, no spaces, no Hebrew vowels)
const SOLDIER_ALIASES: Record<string, string> = {
  // name
  'שם': 'name', 'שםמלא': 'name', 'שםפרטי': 'name', 'name': 'name',
  // id
  'מא': 'id', 'מספראישי': 'id', 'מסאישי': 'id', 'תז': 'id', 'id': 'id',
  // unit
  'פלוגה': 'unit', 'מחלקה': 'unit', 'יחידה': 'unit', 'unit': 'unit',
  // team
  'כיתה': 'team', 'צוות': 'team', 'team': 'team',
  // role
  'תפקיד': 'role', 'role': 'role',
  // rank
  'דרגה': 'rank', 'rank': 'rank',
  // phone
  'טלפון': 'phone', 'נייד': 'phone', 'phone': 'phone',
}

/** Strip Hebrew nikud (vowel diacritics) and normalise to lowercase, no spaces, no punctuation */
function normaliseHeader(h: string): string {
  return h
    .replace(/[֑-ׇ]/g, '') // nikud
    .replace(/['"״׳]/g, '')          // Hebrew geresh/gershayim
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** Try to parse a cell value as a date. Returns null if not a date. */
function tryParseDate(value: string): Date | null {
  const v = value.trim()
  if (!v) return null

  // Excel serial number
  const serial = Number(v)
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    // Excel epoch: Jan 1 1900 = serial 1 (with the Lotus 1-2-3 leap-year bug)
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
    return isValid(d) ? d : null
  }

  // Try common formats
  const formats = ['dd/MM/yyyy', 'dd/MM/yy', 'dd/MM', 'd/M/yyyy', 'd/M/yy', 'd/M']
  const ref = new Date() // reference date for missing year
  for (const fmt of formats) {
    const d = parse(v, fmt, ref)
    if (isValid(d)) return d
  }
  return null
}

export function parseSheet(rawValues: string[][]): ParseResult {
  const warnings: string[] = []
  const soldiers: SoldierFields[] = []
  const statuses: StatusEntry[] = []

  if (!rawValues.length) {
    warnings.push('Sheet is empty')
    return { soldiers, statuses, schema: emptySchema(), warnings }
  }

  // Find header row (first non-empty row)
  let headerRowIdx = rawValues.findIndex(row => row.some(c => c.trim()))
  if (headerRowIdx === -1) {
    warnings.push('No header row found')
    return { soldiers, statuses, schema: emptySchema(), warnings }
  }

  const headerRow = rawValues[headerRowIdx]
  const schema = buildSchema(headerRow, headerRowIdx)
  if (schema.soldierColIndices.size === 0 && schema.dateColIndices.size === 0) {
    warnings.push('Could not detect any soldier or date columns from headers')
  }

  // Data rows
  for (let r = headerRowIdx + 1; r < rawValues.length; r++) {
    const row = rawValues[r]
    if (!row || row.every(c => !c.trim())) continue // skip blank rows

    const soldierFields = extractSoldierFields(row, schema, r)
    soldiers.push(soldierFields)

    // Status entries (wide → long)
    for (const [colIdx, date] of schema.dateColIndices) {
      const code = (row[colIdx] ?? '').trim()
      const entry: StatusEntry = {
        soldierId: soldierFields.id || soldierFields.name,
        date,
        dateKey: toDateKey(date),
        code,
        sourceCell: { row: r, col: colIdx },
      }
      statuses.push(entry)
    }
  }

  return { soldiers, statuses, schema, warnings }
}

function buildSchema(headerRow: string[], headerRowIdx: number): SheetSchema {
  const soldierColIndices = new Map<any, number>()
  const extraColIndices = new Map<string, number>()
  const dateColIndices = new Map<number, Date>()

  for (let c = 0; c < headerRow.length; c++) {
    const raw = headerRow[c]
    const normalised = normaliseHeader(raw)

    const canonicalField = SOLDIER_ALIASES[normalised]
    if (canonicalField) {
      if (!soldierColIndices.has(canonicalField)) {
        soldierColIndices.set(canonicalField, c)
      }
      continue
    }

    const date = tryParseDate(raw)
    if (date) {
      dateColIndices.set(c, date)
      continue
    }

    if (raw.trim()) {
      extraColIndices.set(raw.trim(), c)
    }
  }

  return { soldierColIndices, extraColIndices, dateColIndices, headerRow: headerRowIdx }
}

function extractSoldierFields(row: string[], schema: SheetSchema, sourceRow: number): SoldierFields {
  const get = (field: string) => {
    const col = schema.soldierColIndices.get(field as any)
    return col !== undefined ? (row[col] ?? '').trim() : ''
  }

  const extra: Record<string, string> = {}
  for (const [header, col] of schema.extraColIndices) {
    const val = (row[col] ?? '').trim()
    if (val) extra[header] = val
  }

  const name = get('name')
  const id = get('id')

  return {
    id: id || name, // fallback to name if no id column
    name,
    unit: get('unit') || undefined,
    team: get('team') || undefined,
    role: get('role') || undefined,
    rank: get('rank') || undefined,
    phone: get('phone') || undefined,
    extra,
    sourceRow,
  }
}

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function emptySchema(): SheetSchema {
  return {
    soldierColIndices: new Map(),
    extraColIndices: new Map(),
    dateColIndices: new Map(),
    headerRow: 0,
  }
}
