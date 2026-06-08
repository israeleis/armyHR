import { Link, useLocation } from 'react-router-dom'

function IconDiary() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <line x1="8" y1="14" x2="16" y2="14"/>
    </svg>
  )
}

function IconTrends() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
}

function IconImport() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )
}

const NAV_ITEMS = [
  { to: '/diary',   label: 'יומן',  Icon: IconDiary },
  { to: '/trends',  label: 'מגמות', Icon: IconTrends },
  { to: '/import',  label: 'ייבוא', Icon: IconImport },
]

export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-surface-container border-t border-outline-variant safe-area-bottom">
      <div className="flex">
        {NAV_ITEMS.map(({ to, label, Icon }) => {
          const active = pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-xs font-bold transition-colors
                ${active ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              <Icon />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
