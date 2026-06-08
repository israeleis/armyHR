import { lookupStatus, UNKNOWN_STATUS } from '@/domain/statusVocabulary'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  code: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function StatusBadge({ code, size = 'md', className }: StatusBadgeProps) {
  const status = lookupStatus(code)
  const isUnknown = status === UNKNOWN_STATUS

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center font-bold rounded-sm leading-none',
        isUnknown && 'border border-outline text-outline',
        sizeClasses[size],
        className,
      )}
      style={
        !isUnknown
          ? { backgroundColor: status.bg, color: status.fg }
          : undefined
      }
      title={status.label}
      aria-label={`סטטוס: ${status.label}`}
    >
      {code.trim() || '—'}
    </span>
  )
}
