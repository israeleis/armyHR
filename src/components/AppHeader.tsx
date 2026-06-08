import { useTheme } from '@/hooks/useTheme'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'

interface AppHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function AppHeader({ sidebarOpen, onToggleSidebar }: AppHeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const sheet = getSelectedSheet()

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-40 h-[52px] bg-surface-container border-b border-outline-variant flex items-center justify-between px-4"
    >
      {/* RIGHT (RTL start): hamburger or close */}
      <button
        onClick={onToggleSidebar}
        className="text-primary flex items-center justify-center w-[44px] h-[44px]"
        aria-label={sidebarOpen ? 'סגור תפריט' : 'פתח תפריט'}
      >
        {sidebarOpen ? <CloseIcon /> : <HamburgerIcon />}
      </button>

      {/* CENTER: current sheet name */}
      <span className="flex-1 text-center text-sm font-bold text-on-surface truncate px-2">
        {sheet?.name ?? 'ניהול כוח אדם'}
      </span>

      {/* LEFT (RTL end): theme toggle */}
      <button
        onClick={toggleTheme}
        className="text-primary flex items-center justify-center w-[44px] h-[44px]"
        aria-label={theme === 'dark' ? 'עבור למצב יום' : 'עבור למצב לילה'}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
    </header>
  )
}
