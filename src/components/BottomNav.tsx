import { Link, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/diary', label: 'יומן', icon: '📋' },
  { to: '/trends', label: 'מגמות', icon: '📊' },
  { to: '/import', label: 'ייבוא', icon: '📥' },
]

export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-surface-high border-t border-outline-variant safe-area-bottom">
      <div className="flex">
        {NAV_ITEMS.map(item => {
          const active = pathname.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex-1 flex flex-col items-center justify-center py-3 text-xs font-bold transition-colors
                ${active ? 'text-primary' : 'text-on-surface-variant'}`}
            >
              <span className="text-xl leading-none mb-1">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
