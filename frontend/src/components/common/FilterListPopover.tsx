import { usePopover } from '../../hooks/usePopover'

interface FilterListPopoverProps {
  popover: ReturnType<typeof usePopover>
  title: string
  options: { label: string; value: string | null }[]
  selected: string | null
  onSelect: (value: string | null) => void
  width?: string
}

export function FilterListPopover({ popover, title, options, selected, onSelect, width = 'w-52' }: FilterListPopoverProps) {
  if (!popover.open) return null

  return (
    <div
      ref={popover.popoverRef}
      className={`fixed z-[9999] surface-raised p-2 ${width} animate-fade-in`}
      style={{ top: popover.pos.top, left: popover.pos.left }}
    >
      {title && <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] mb-2 px-2">{title}</div>}
      <div className="space-y-0.5">
        {options.map(opt => (
          <button
            key={opt.label}
            onClick={() => { onSelect(selected === opt.value ? null : opt.value); popover.close() }}
            className={`flex w-full items-center justify-between text-left text-[13px] px-2.5 py-2 rounded-lg transition-colors ${
              selected === opt.value
                ? 'bg-accent-500/12 text-accent-300 font-medium'
                : 'text-slate-200 hover:bg-white/[0.05]'
            }`}
          >
            <span>{opt.label}</span>
            {selected === opt.value && (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
