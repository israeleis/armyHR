import { CollapsibleSection } from '@/components/FilterPane'
import type { GroupByOption } from './groupBy'

interface GroupBySectionProps<K extends string> {
  options: GroupByOption[]
  groupByKeys: K[]
  onAdd: (k: K) => void
  onRemove: (k: K) => void
  onMove: (idx: number, dir: -1 | 1) => void
}

function ArrowUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  )
}

function ArrowDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

export function GroupBySection<K extends string>({ options, groupByKeys, onAdd, onRemove, onMove }: GroupBySectionProps<K>) {
  const available = options.filter(o => !groupByKeys.includes(o.key as K))
  return (
    <CollapsibleSection label="קיבוץ לפי" badge={groupByKeys.length || undefined}>
      {groupByKeys.length > 0 && (
        <div className="space-y-1 mb-3">
          {groupByKeys.map((key, idx) => {
            const opt = options.find(o => o.key === key)!
            return (
              <div key={key} className="flex items-center gap-2 bg-primary-container rounded-md px-3 py-2">
                <span className="text-[10px] font-mono text-on-primary-container/50 w-4 shrink-0">{idx + 1}</span>
                <span className="text-sm font-medium text-on-primary-container flex-1">{opt.label}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => onMove(idx, -1)} disabled={idx === 0}
                    className="flex items-center justify-center w-6 h-6 rounded text-on-primary-container/70 hover:text-on-primary-container disabled:opacity-20 transition-colors">
                    <ArrowUp />
                  </button>
                  <button onClick={() => onMove(idx, 1)} disabled={idx === groupByKeys.length - 1}
                    className="flex items-center justify-center w-6 h-6 rounded text-on-primary-container/70 hover:text-on-primary-container disabled:opacity-20 transition-colors">
                    <ArrowDown />
                  </button>
                  <button onClick={() => onRemove(key)}
                    className="flex items-center justify-center w-6 h-6 rounded text-on-primary-container/70 hover:text-on-primary-container transition-colors text-base leading-none">
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.map(opt => (
            <button key={opt.key} onClick={() => onAdd(opt.key as K)}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-surface-high text-on-surface-variant hover:text-on-surface transition-colors">
              + {opt.label}
            </button>
          ))}
        </div>
      )}
      {available.length === 0 && groupByKeys.length > 0 && (
        <p className="text-xs text-on-surface-variant font-mono text-right">כל השדות נבחרו</p>
      )}
    </CollapsibleSection>
  )
}
