import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption<T extends string = string> {
  value: T
  label: ReactNode
  /** Optional secondary text shown on the right of the option (e.g. "current"). */
  hint?: string
  disabled?: boolean
}

interface SelectProps<T extends string = string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SelectOption<T>>
  /** Optional label rendered inline before the trigger (uppercase microcopy). */
  label?: string
  /** Visual variant. `default` = standard glass select. `inline` = compact, label adjacent. */
  variant?: 'default' | 'inline'
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Trigger min-width — supports tailwind class (e.g. "sm:min-w-[200px]"). */
  triggerClassName?: string
  /** Pop direction. `auto` flips when there's not enough room below. */
  placement?: 'auto' | 'bottom' | 'top'
  id?: string
}

/** Maximum visible dropdown height in px. */
const MAX_DROPDOWN_HEIGHT = 280
/** Px gap between trigger and floating dropdown. */
const FLOAT_OFFSET = 8

interface FloatingPos {
  top: number
  left: number
  width: number
  /** True when dropdown should open upward (not enough space below). */
  popUp: boolean
}

/**
 * Premium custom select — fully themed dark-glass dropdown.
 *
 * Renders the dropdown via a React portal to `document.body` so it escapes
 * any `overflow:hidden` / `isolation` / transformed ancestor — meaning it
 * never expands its parent's layout.
 */
export function Select<T extends string = string>({
  value,
  onChange,
  options,
  label,
  variant = 'default',
  placeholder = 'Select…',
  disabled = false,
  className = '',
  triggerClassName = '',
  placement = 'auto',
  id,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [pos, setPos] = useState<FloatingPos | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  )
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null

  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }, [])

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const popUp =
      placement === 'top' ||
      (placement === 'auto' && spaceBelow < MAX_DROPDOWN_HEIGHT && spaceAbove > spaceBelow)

    setPos({
      top: popUp ? rect.top - FLOAT_OFFSET : rect.bottom + FLOAT_OFFSET,
      left: rect.left,
      width: rect.width,
      popUp,
    })
  }, [placement])

  // Click-outside (covers both portal listbox and trigger) + ESC
  useEffect(() => {
    if (!open) return

    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        (wrapperRef.current && wrapperRef.current.contains(target)) ||
        (listRef.current && listRef.current.contains(target))
      ) {
        return
      }
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }

    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  // Position calculation on open + reposition on scroll/resize
  useLayoutEffect(() => {
    if (!open) return

    computePosition()
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)

    const onUpdate = () => computePosition()
    window.addEventListener('scroll', onUpdate, true)
    window.addEventListener('resize', onUpdate)
    return () => {
      window.removeEventListener('scroll', onUpdate, true)
      window.removeEventListener('resize', onUpdate)
    }
  }, [open, selectedIndex, computePosition])

  // Scroll active item into view
  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const moveActive = (delta: number) => {
    if (options.length === 0) return
    setActiveIndex((prev) => {
      let next = prev
      for (let i = 0; i < options.length; i++) {
        next = (next + delta + options.length) % options.length
        if (!options[next].disabled) return next
      }
      return prev
    })
  }

  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (e.key === 'ArrowDown') moveActive(1)
      else if (e.key === 'ArrowUp') moveActive(-1)
      else if (e.key === 'Enter' || e.key === ' ') {
        const opt = options[activeIndex]
        if (opt && !opt.disabled) {
          onChange(opt.value)
          close()
        }
      }
    } else if (e.key === 'Tab' && open) {
      setOpen(false)
    }
  }

  const isInline = variant === 'inline'

  const triggerBase =
    'group relative inline-flex items-center justify-between gap-2 w-full text-sm font-medium ' +
    'rounded-lg border bg-white/[0.03] border-white/[0.08] text-slate-100 ' +
    'transition-all duration-200 ease-out-expo cursor-pointer select-none ' +
    'shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] ' +
    'hover:border-white/[0.14] hover:bg-white/[0.05] ' +
    'focus:outline-none focus:border-accent-400/55 focus:ring-2 focus:ring-accent-500/20 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed'

  const triggerSizing = isInline ? 'h-9 px-3 text-[13px]' : 'h-10 pl-3.5 pr-2.5'

  const dropdown = open && pos ? (
    <div
      ref={listRef}
      role="listbox"
      aria-activedescendant={
        activeIndex >= 0 ? `${id ?? 'select'}-opt-${activeIndex}` : undefined
      }
      className="z-[80] max-h-[280px] overflow-y-auto p-1 rounded-xl surface-raised animate-fade-in"
      style={{
        position: 'fixed',
        top: pos.popUp ? undefined : pos.top,
        bottom: pos.popUp ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: pos.width,
        minWidth: pos.width,
      }}
    >
      {options.length === 0 ? (
        <div className="px-3 py-4 text-center text-[13px] text-slate-500">No options</div>
      ) : (
        options.map((opt, i) => {
          const isSelected = opt.value === value
          const isActive = i === activeIndex
          return (
            <button
              key={opt.value}
              id={`${id ?? 'select'}-opt-${i}`}
              data-index={i}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={opt.disabled}
              onClick={() => {
                if (opt.disabled) return
                onChange(opt.value)
                close()
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`group/opt flex w-full items-center justify-between gap-2 px-2.5 py-2
                text-[13px] rounded-lg transition-colors duration-100
                ${
                  opt.disabled
                    ? 'text-slate-600 cursor-not-allowed'
                    : isSelected
                      ? 'bg-accent-500/12 text-accent-300 font-medium'
                      : isActive
                        ? 'bg-white/[0.06] text-slate-50'
                        : 'text-slate-200 hover:bg-white/[0.04]'
                }`}
            >
              <span className="truncate text-left">{opt.label}</span>
              <span className="shrink-0 inline-flex items-center gap-1.5">
                {opt.hint && (
                  <span
                    className={`text-[10.5px] font-mono uppercase tracking-wider ${
                      isSelected ? 'text-accent-300/80' : 'text-slate-500'
                    }`}
                  >
                    {opt.hint}
                  </span>
                )}
                {isSelected && (
                  <svg
                    className="w-3.5 h-3.5 text-accent-300"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.6}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </span>
            </button>
          )
        })
      )}
    </div>
  ) : null

  return (
    <div
      ref={wrapperRef}
      className={`${isInline ? 'inline-flex items-center gap-2' : 'flex flex-col items-stretch'} ${
        className.includes('w-full') ? 'w-full' : 'w-full sm:w-auto'
      } ${className}`}
    >
      {label && (
        <label
          htmlFor={id}
          className={`text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 whitespace-nowrap ${
            isInline ? '' : 'mb-1.5'
          }`}
        >
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        className={`${triggerBase} ${triggerSizing} ${triggerClassName}`}
      >
        <span className={`block truncate text-left ${selected ? '' : 'text-slate-500'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-md text-slate-400 group-hover:text-slate-200 transition-colors">
          <svg
            className={`w-3 h-3 transition-transform duration-200 ease-out-expo ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {dropdown && createPortal(dropdown, document.body)}
    </div>
  )
}
