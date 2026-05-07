import { useEffect, useState } from 'react'

interface UseScrolledResult {
  scrolled: boolean
  progress: number
}

/**
 * Tracks vertical scroll. Returns:
 *   - scrolled: true once past `threshold` px
 *   - progress: 0..1 ramp from 0 to `rampDistance` px (for fading effects)
 */
export function useScrolled(threshold = 12, rampDistance = 120): UseScrolledResult {
  const [state, setState] = useState<UseScrolledResult>({ scrolled: false, progress: 0 })

  useEffect(() => {
    let ticking = false

    const update = () => {
      const y = window.scrollY
      const scrolled = y > threshold
      const progress = Math.min(1, Math.max(0, y / rampDistance))
      setState((prev) =>
        prev.scrolled === scrolled && Math.abs(prev.progress - progress) < 0.01
          ? prev
          : { scrolled, progress },
      )
      ticking = false
    }

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update)
        ticking = true
      }
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold, rampDistance])

  return state
}
