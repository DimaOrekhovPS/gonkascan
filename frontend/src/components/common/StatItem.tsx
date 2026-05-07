import type { ReactNode } from 'react'

interface StatItemProps {
  label: string
  children: ReactNode
  subText?: ReactNode
  accent?: boolean
}

export function StatItem({ label, children, subText, accent }: StatItemProps) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2 leading-tight">
        {label}
      </div>
      <div
        className={`text-lg sm:text-xl font-bold leading-none tabular-nums tracking-tight ${
          accent ? 'text-accent-400' : 'text-slate-50'
        }`}
      >
        {children}
      </div>
      {subText !== undefined && (
        <div className="text-[11.5px] text-slate-500 mt-2 min-h-[1.25rem] leading-relaxed">
          {subText}
        </div>
      )}
    </div>
  )
}
