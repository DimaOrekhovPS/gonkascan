import type { ReactNode } from 'react'

interface StatCardProps {
  label: ReactNode
  children: ReactNode
  valueClassName?: string
  size?: 'sm' | 'lg'
}

export function StatCard({ label, children, valueClassName, size = 'sm' }: StatCardProps) {
  const sizeClass = size === 'lg' ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'

  return (
    <div className="surface-inset p-4">
      <div className="block text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] mb-2">
        {label}
      </div>
      <div
        className={`mt-1 ${sizeClass} font-semibold tabular-nums break-words tracking-tight ${
          valueClassName || 'text-slate-50'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
