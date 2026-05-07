import { useEffect, useState } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'

/**
 * Page-fixed animated mesh-gradient background.
 *
 * Three safeguards:
 *  1. `prefers-reduced-motion`: returns null so the static body gradient is used.
 *  2. Pauses rendering when the tab is hidden (saves GPU/battery).
 *  3. Caps device pixel ratio so 4K Retina displays don't render at 8M pixels.
 */
export function MeshBackground() {
  const [reducedMotion, setReducedMotion] = useState(false)
  const [hidden, setHidden] = useState(false)

  // 1) Honor prefers-reduced-motion (and update if user toggles it mid-session)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])

  // 2) Pause when document is hidden — speed=0 freezes the shader on its current frame
  useEffect(() => {
    const update = () => setHidden(document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  // Reduced-motion users see the static CSS gradient defined on body, not the shader.
  if (reducedMotion) return null

  // Twilight palette tuned for the dark-luxury aesthetic.
  // Order matters — these flow into each other in the mesh.
  const colors = [
    '#0a0e18', // deep night base
    '#0f1a2e', // midnight indigo
    '#0d2a3a', // teal abyss
    '#1a3a52', // sapphire glow
    '#1c4d3e', // emerald undertone
  ]

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <MeshGradient
        colors={colors}
        speed={hidden ? 0 : 0.15}
        distortion={0.85}
        swirl={0.3}
        grainMixer={0.05}
        grainOverlay={0.0}
        // 3) Performance caps:
        // - minPixelRatio caps internal canvas DPR so 4K Retina doesn't render 8M pixels
        // - maxPixelCount further limits GPU work on huge displays (~2.07M = 1080p @ 1x)
        minPixelRatio={1}
        maxPixelCount={1920 * 1080}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
      {/* Subtle dark veil so foreground text/cards keep their contrast over the
         shader's brighter color regions. */}
      <div className="absolute inset-0 bg-night-50/40" />
    </div>
  )
}
