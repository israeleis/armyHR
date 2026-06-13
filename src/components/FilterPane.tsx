import { useState } from 'react'
import type { FilterSection } from '@/features/filters'

interface FilterPaneProps {
  open: boolean
  onClose: () => void
  sections: FilterSection[]
  multiSelect: Record<string, Set<string>>
  text: Record<string, string>
  onMultiToggle: (key: string, value: string) => void
  onMultiClear: (key: string) => void
  onTextChange: (key: string, value: string) => void
  onClearAll: () => void
  onSaveRequest?: () => void
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 150ms ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Collapsible section ────────────────────────────────────────────────────

function CollapsibleSection({ label, badge, children }: { label: string; badge?: number; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b border-outline-variant last:border-b-0">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-right"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-on-surface">{label}</span>
          {!!badge && (
            <span className="text-[10px] font-mono bg-primary text-on-primary rounded-full px-1.5 py-0.5 leading-none">
              {badge}
            </span>
          )}
        </div>
        <span className="text-on-surface-variant"><ChevronIcon open={expanded} /></span>
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

// ── Multi-select section content ───────────────────────────────────────────

function MultiSelectContent({ options, selected, onToggle, onClear }: {
  options: string[]
  selected: Set<string>
  onToggle: (v: string) => void
  onClear: () => void
}) {
  const allSelected = selected.size === 0
  return (
    <>
      <button
        onClick={onClear}
        className={[
          'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-right mb-1',
          allSelected ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-high',
        ].join(' ')}
      >
        <span className={['w-4 h-4 rounded border flex items-center justify-center shrink-0', allSelected ? 'bg-primary border-primary' : 'border-outline'].join(' ')}>
          {allSelected && <CheckIcon />}
        </span>
        <span className="flex-1">הכל</span>
      </button>
      {options.map(opt => {
        const checked = selected.has(opt)
        return (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className={[
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-right mb-1',
              checked && !allSelected ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-high',
            ].join(' ')}
          >
            <span className={['w-4 h-4 rounded border flex items-center justify-center shrink-0', checked && !allSelected ? 'bg-primary border-primary' : 'border-outline'].join(' ')}>
              {checked && !allSelected && <CheckIcon />}
            </span>
            <span className="flex-1 truncate">{opt}</span>
          </button>
        )
      })}
    </>
  )
}

// ── Text section content ───────────────────────────────────────────────────

function TextContent({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="חיפוש חופשי..."
        dir="rtl"
        className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
          aria-label="נקה"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── FilterPane ─────────────────────────────────────────────────────────────

export function FilterPane({
  open, onClose, sections, multiSelect, text,
  onMultiToggle, onMultiClear, onTextChange, onClearAll, onSaveRequest,
}: FilterPaneProps) {
  return (
    <>
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-black/60" style={{ top: '52px' }} onClick={onClose} />
      )}
      <div
        dir="rtl"
        className={[
          'fixed top-[52px] left-0 bottom-0 z-50',
          'w-[78%] max-w-[300px]',
          'bg-surface-container border-r border-outline-variant',
          'flex flex-col',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant shrink-0">
          <span className="text-sm font-bold text-on-surface">סינון</span>
          <div className="flex items-center gap-1">
            <button onClick={onClearAll} className="text-xs text-primary font-bold px-2 py-1">נקה הכל</button>
            <button onClick={onClose} className="text-on-surface-variant flex items-center justify-center w-[36px] h-[36px]">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto">
          {sections.map(section => {
            if (section.type === 'multiselect') {
              const selected = multiSelect[section.key] ?? new Set<string>()
              return (
                <CollapsibleSection key={section.key} label={section.label} badge={selected.size || undefined}>
                  <MultiSelectContent
                    options={section.options}
                    selected={selected}
                    onToggle={v => onMultiToggle(section.key, v)}
                    onClear={() => onMultiClear(section.key)}
                  />
                </CollapsibleSection>
              )
            } else {
              const value = text[section.key] ?? ''
              return (
                <CollapsibleSection key={section.key} label={section.label} badge={value.trim() ? 1 : undefined}>
                  <TextContent
                    value={value}
                    onChange={v => onTextChange(section.key, v)}
                  />
                </CollapsibleSection>
              )
            }
          })}
        </div>

        {/* Save view button */}
        {onSaveRequest && (
          <div className="shrink-0 px-4 py-3 border-t border-outline-variant">
            <button
              onClick={onSaveRequest}
              className="w-full text-sm font-bold text-primary py-2 rounded-md hover:bg-surface-high transition-colors text-right"
            >
              + שמור תצוגה
            </button>
          </div>
        )}
      </div>
    </>
  )
}
