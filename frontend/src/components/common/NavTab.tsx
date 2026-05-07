import { useState, useRef, useEffect } from 'react'

interface NavTabProps {
  active: boolean
  onClick: () => void
  children: string
  /** When true, the tab adapts to a transparent header (uses lighter text). */
  onHeader?: boolean
}

export function NavTab({ active, onClick, children }: NavTabProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative whitespace-nowrap shrink-0 px-3.5 h-9 text-[13px] font-medium rounded-lg
        transition-all duration-200 ease-out-expo
        ${
          active
            ? 'text-slate-50'
            : 'text-slate-400 hover:text-slate-100'
        }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-lg bg-white/[0.06] border border-white/[0.10] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
        />
      )}
      <span className="relative z-10">{children}</span>
      {!active && (
        <span
          aria-hidden
          className="absolute inset-x-3.5 bottom-1 h-px origin-center scale-x-0 rounded-full bg-gradient-to-r from-transparent via-accent-400/70 to-transparent transition-transform duration-300 ease-out-expo group-hover:scale-x-100"
        />
      )}
    </button>
  )
}

interface NavDropdownProps {
  label: string
  active: boolean
  items: { page: string; label: string }[]
  activePage: string
  onSelect: (page: string) => void
}

export function NavDropdown({ label, active, items, activePage, onSelect }: NavDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`group relative whitespace-nowrap shrink-0 px-3.5 h-9 text-[13px] font-medium rounded-lg
          transition-all duration-200 ease-out-expo flex items-center gap-1.5
          ${
            active
              ? 'text-slate-50'
              : 'text-slate-400 hover:text-slate-100'
          }`}
      >
        {active && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-lg bg-white/[0.06] border border-white/[0.10] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]"
          />
        )}
        <span className="relative z-10">{label}</span>
        <svg
          className={`relative z-10 w-3 h-3 text-slate-500 transition-transform duration-300 ease-out-expo ${
            open ? 'rotate-180 text-slate-200' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
        {!active && (
          <span
            aria-hidden
            className="absolute inset-x-3.5 bottom-1 h-px origin-center scale-x-0 rounded-full bg-gradient-to-r from-transparent via-accent-400/70 to-transparent transition-transform duration-300 ease-out-expo group-hover:scale-x-100"
          />
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 min-w-[200px] origin-top animate-fade-in py-1.5
            rounded-xl bg-night-200/95 border border-white/[0.08] shadow-pop backdrop-blur-xl"
        >
          {items.map((item) => (
            <button
              key={item.page}
              onClick={() => {
                onSelect(item.page)
                setOpen(false)
              }}
              className={`group/item relative flex w-full items-center justify-between px-3 py-2 text-[13px] font-medium transition-colors mx-1 rounded-lg ${
                activePage === item.page
                  ? 'bg-accent-500/10 text-accent-300'
                  : 'text-slate-300 hover:bg-white/[0.04] hover:text-slate-50'
              }`}
            >
              <span>{item.label}</span>
              {activePage === item.page && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-accent-400 shadow-[0_0_8px_rgba(62,229,177,0.7)]"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
