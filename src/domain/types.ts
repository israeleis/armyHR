export interface SoldierFields {
  id: string           // מ"א / מספר אישי
  name: string         // שם
  unit?: string        // פלוגה / מחלקה / יחידה
  team?: string        // כיתה / צוות
  role?: string        // תפקיד
  rank?: string        // דרגה
  phone?: string       // טלפון / נייד
  extra: Record<string, string>  // any unrecognised soldier columns
  sourceRow: number    // 0-indexed row in the original sheet (for write-back)
}

export interface CellCoord {
  row: number   // 0-indexed
  col: number   // 0-indexed
}

export interface StatusEntry {
  soldierId: string    // same as SoldierFields.id (or name if no id column)
  date: Date
  dateKey: string      // ISO date string YYYY-MM-DD — stable map key
  code: string         // raw cell value (e.g. "נ", "יח", "חול")
  sourceCell: CellCoord  // write-back target
}

export interface SheetSchema {
  soldierColIndices: Map<keyof Omit<SoldierFields, 'extra' | 'sourceRow'>, number>
  soldierColHeaders: Map<keyof Omit<SoldierFields, 'extra' | 'sourceRow'>, string>  // original header text
  extraColIndices: Map<string, number>   // header → col index for unknown cols
  dateColIndices: Map<number, Date>      // col index → parsed Date
  headerRow: number   // index of the header row (usually 0)
}

export interface ParseResult {
  soldiers: SoldierFields[]
  statuses: StatusEntry[]
  schema: SheetSchema
  warnings: string[]
}
