export interface StatusDef {
  code: string
  name: string
  inArmy: boolean  // physically at base/in service
  isPaid: boolean  // counted for pay
}

export const KNOWN_STATUSES: StatusDef[] = [
  { code: 'נ',   name: 'נוכח',          inArmy: true,  isPaid: true  },
  { code: 'י',   name: 'יוצא',          inArmy: false, isPaid: true  },
  { code: 'ח',   name: 'חוזר',          inArmy: true,  isPaid: true  },
  { code: 'ג',   name: 'גימלים',        inArmy: true,  isPaid: true  },
  { code: 'יח',  name: 'יוצא-חוזר',    inArmy: true,  isPaid: true  },
  { code: 'חי',  name: 'חד יומי',      inArmy: true,  isPaid: true  },
  { code: 'ת',   name: 'תשלום',         inArmy: false, isPaid: true  },
  { code: 'ב',   name: 'בית',           inArmy: false, isPaid: false },
  { code: 'ל',   name: 'סגירת שמ״פ',  inArmy: false, isPaid: true  },
  { code: 'פ',   name: 'פתיחת שמ״פ',  inArmy: true,  isPaid: true  },
  { code: 'חול', name: 'חול',           inArmy: false, isPaid: false },
]

const STATUS_MAP = new Map(KNOWN_STATUSES.map(s => [s.code, s]))

export function getStatus(code: string): StatusDef | null {
  return STATUS_MAP.get(code) ?? null
}

export function isInArmy(code: string): boolean {
  return STATUS_MAP.get(code)?.inArmy ?? false
}

export function isPaid(code: string): boolean {
  return STATUS_MAP.get(code)?.isPaid ?? false
}

// Codes grouped by inArmy for daily view sections
export const IN_ARMY_CODES  = new Set(KNOWN_STATUSES.filter(s => s.inArmy).map(s => s.code))
export const OUT_PAID_CODES = new Set(KNOWN_STATUSES.filter(s => !s.inArmy && s.isPaid).map(s => s.code))
export const OUT_FREE_CODES = new Set(KNOWN_STATUSES.filter(s => !s.inArmy && !s.isPaid).map(s => s.code))
