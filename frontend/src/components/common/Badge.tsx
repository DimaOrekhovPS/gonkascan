import type { ReactNode } from 'react'

type BadgeVariant = 'green' | 'red' | 'orange' | 'yellow' | 'blue' | 'gray' | 'dark' | 'accent' | 'gold'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  green: 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/25',
  red: 'bg-red-500/10 text-red-300 border border-red-400/25',
  orange: 'bg-orange-500/10 text-orange-300 border border-orange-400/25',
  yellow: 'bg-amber-500/10 text-amber-300 border border-amber-400/25',
  blue: 'bg-sky-500/10 text-sky-300 border border-sky-400/25',
  gray: 'bg-white/5 text-slate-300 border border-white/10',
  dark: 'bg-slate-50 text-night-50 border border-slate-50',
  accent: 'bg-accent-500/12 text-accent-300 border border-accent-400/30',
  gold: 'bg-gold-500/12 text-gold-400 border border-gold-500/30',
}

export function Badge({ variant = 'gray', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10.5px] font-semibold rounded-md tracking-wide ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
