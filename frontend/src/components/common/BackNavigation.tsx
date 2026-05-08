import type { ReactNode } from 'react'

interface BackNavigationProps {
  onBack: () => void
  backLabel?: string
  title: ReactNode
  badge?: { label: string; color: 'blue' | 'orange' }
}

export function BackNavigation({ onBack, backLabel, title, badge }: BackNavigationProps) {
  return (
    <nav className="min-w-0">
      <button
        onClick={onBack}
        className="group inline-flex items-center gap-1.5 -ml-1 px-2 py-1 text-[13px] font-medium text-slate-400 hover:text-slate-100 transition-colors mb-2 rounded-md hover:bg-white/[0.04]"
      >
        <svg
          className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {backLabel}
      </button>
      <div className="flex items-start sm:items-center gap-2 flex-wrap">
        <span className="text-[15px] sm:text-xl font-bold text-slate-50 break-all tracking-tight leading-snug min-w-0">
          {title}
        </span>
        {badge && (
          <span
            className={`shrink-0 inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-md tracking-wide mt-0.5 sm:mt-0 ${
              badge.color === 'blue'
                ? 'bg-sky-500/10 text-sky-300 border border-sky-400/25'
                : 'bg-orange-500/10 text-orange-300 border border-orange-400/25'
            }`}
          >
            {badge.label}
          </span>
        )}
      </div>
    </nav>
  )
}
