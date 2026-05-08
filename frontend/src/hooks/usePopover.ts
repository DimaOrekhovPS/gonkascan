import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'

export interface PopoverPos {
  top: number
  left: number
}

const VIEWPORT_PADDING = 8

export function usePopover() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PopoverPos>({ top: 0, left: 0 })
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRectRef = useRef<DOMRect | null>(null)

  const computeClampedPos = useCallback((triggerRect: DOMRect): PopoverPos => {
    const popover = popoverRef.current
    const popWidth = popover?.offsetWidth ?? 288
    const popHeight = popover?.offsetHeight ?? 0

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = triggerRect.left
    // Right-edge clamp: keep popover fully visible
    if (left + popWidth + VIEWPORT_PADDING > viewportWidth) {
      left = Math.max(VIEWPORT_PADDING, viewportWidth - popWidth - VIEWPORT_PADDING)
    }
    if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING

    let top = triggerRect.bottom + 4
    // Bottom-edge clamp: flip above if not enough space below
    if (popHeight > 0 && top + popHeight + VIEWPORT_PADDING > viewportHeight) {
      const above = triggerRect.top - popHeight - 4
      if (above >= VIEWPORT_PADDING) {
        top = above
      } else {
        top = Math.max(VIEWPORT_PADDING, viewportHeight - popHeight - VIEWPORT_PADDING)
      }
    }

    return { top, left }
  }, [])

  const toggle = useCallback(
    (e: React.MouseEvent) => {
      if (open) {
        setOpen(false)
        return
      }
      const btn = e.currentTarget as HTMLElement
      const rect = btn.getBoundingClientRect()
      triggerRectRef.current = rect
      // Initial position (popover not yet measured) — refined after mount.
      setPos(computeClampedPos(rect))
      setOpen(true)
    },
    [open, computeClampedPos],
  )

  // After the popover renders, re-measure and re-clamp now that we know its size.
  useLayoutEffect(() => {
    if (!open || !triggerRectRef.current) return
    setPos(computeClampedPos(triggerRectRef.current))
  }, [open, computeClampedPos])

  useEffect(() => {
    if (!open) return

    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleResize() {
      if (triggerRectRef.current) {
        setPos(computeClampedPos(triggerRectRef.current))
      }
    }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
    }
  }, [open, computeClampedPos])

  return { open, pos, toggle, close: () => setOpen(false), popoverRef }
}
