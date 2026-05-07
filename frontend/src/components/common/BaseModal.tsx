import { useEffect, type ReactNode } from 'react'

interface BaseModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export function BaseModal({ title, onClose, children }: BaseModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={handleBackdropClick}
      style={{
        background: 'rgba(8, 11, 18, 0.72)',
        backdropFilter: 'saturate(180%) blur(8px)',
        WebkitBackdropFilter: 'saturate(180%) blur(8px)',
      }}
    >
      <div className="surface-raised w-full max-h-[100dvh] sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl overflow-y-auto pb-6 sm:pb-0 sm:rounded-2xl">
        <div
          className="sticky top-0 z-20 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 border-b border-white/[0.07]"
          style={{
            background: 'rgb(var(--surface-2) / 0.85)',
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          }}
        >
          <h2 className="text-lg sm:text-xl font-bold text-slate-50 leading-tight min-w-0 tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-slate-50 hover:bg-white/[0.06] active:bg-white/[0.10] transition-all"
            aria-label="Close"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">{children}</div>
      </div>
    </div>
  )
}
