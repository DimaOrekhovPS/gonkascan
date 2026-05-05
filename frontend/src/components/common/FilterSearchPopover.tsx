import { useState } from 'react'
import { usePopover } from '../../hooks/usePopover'

interface FilterSearchPopoverProps {
  popover: ReturnType<typeof usePopover>
  placeholder?: string
  value: string | null
  onApply: (value: string | null) => void
}

export function FilterSearchPopover({ popover, placeholder = 'Search...', value, onApply }: FilterSearchPopoverProps) {
  const [input, setInput] = useState(value || '')

  if (!popover.open) return null

  return (
    <div
      ref={popover.popoverRef}
      className="fixed z-[9999] surface-raised p-3 w-72 animate-fade-in"
      style={{ top: popover.pos.top, left: popover.pos.left }}
    >
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={placeholder}
        className="input h-9 text-sm mb-3"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => { onApply(input || null); popover.close() }}
          className="btn-primary flex-1 h-9 text-sm"
        >
          Apply
        </button>
        <button
          onClick={() => { setInput(''); onApply(null); popover.close() }}
          className="btn-secondary flex-1 h-9 text-sm"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
