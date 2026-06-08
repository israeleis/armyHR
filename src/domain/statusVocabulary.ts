export interface StatusDef {
  code: string
  label: string
  bg: string   // background hex
  fg: string   // foreground text hex
}

export const STATUS_MAP: Record<string, StatusDef> = {
  'נ':   { code: 'נ',   label: 'נוכח',        bg: '#66ff33', fg: '#1a1a1a' },
  'י':   { code: 'י',   label: 'יוצא',        bg: '#f4d35e', fg: '#1a1a1a' },
  'ח':   { code: 'ח',   label: 'חוזר',        bg: '#1e4ed8', fg: '#ffffff' },
  'ג':   { code: 'ג',   label: 'גימלים',      bg: '#f5cac3', fg: '#1a1a1a' },
  'יח':  { code: 'יח',  label: 'יוצא-חוזר',  bg: '#c1554f', fg: '#ffffff' },
  'חי':  { code: 'חי',  label: 'חד יומי',    bg: '#7aa44f', fg: '#ffffff' },
  'ת':   { code: 'ת',   label: 'תשלום',       bg: '#ff45c8', fg: '#ffffff' },
  'ל':   { code: 'ל',   label: 'לשחרר היום', bg: '#1a1a1a', fg: '#ffffff' },
  'פ':   { code: 'פ',   label: 'פתיחה',       bg: '#4a6b21', fg: '#ffffff' },
  'מ':   { code: 'מ',   label: 'התארגנות',   bg: '#e08a3c', fg: '#ffffff' },
  'ב':   { code: 'ב',   label: 'בית',         bg: '#f3cfc6', fg: '#1a1a1a' },
  'חול': { code: 'חול', label: 'חול',         bg: '#ed9a3c', fg: '#1a1a1a' },
}

export const UNKNOWN_STATUS: StatusDef = {
  code: '',
  label: '—',
  bg: 'transparent',
  fg: '#919283',
}

export function lookupStatus(code: string): StatusDef {
  return STATUS_MAP[code.trim()] ?? UNKNOWN_STATUS
}

export const ALL_STATUSES = Object.values(STATUS_MAP)
