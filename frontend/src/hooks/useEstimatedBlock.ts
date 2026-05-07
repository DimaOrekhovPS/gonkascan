import { useEffect, useState } from 'react'

/**
 * Estimates the current block height based on a confirmed height + timestamp,
 * advancing once per second.
 *
 * IMPORTANT: pass `''` (empty string) as `confirmedTimestamp` when data is not
 * yet available. The hook will then bail out without scheduling the interval.
 * Do NOT pass `new Date().toISOString()` as a fallback — that would generate a
 * new string reference on every render, causing the effect to re-run and
 * trigger an infinite update loop.
 */
export function useEstimatedBlock(
  confirmedHeight: number,
  confirmedTimestamp: string,
  avgBlockTime: number,
): number {
  const [currentTime, setCurrentTime] = useState(Date.now())

  useEffect(() => {
    if (!confirmedTimestamp) return

    setCurrentTime(Date.now())
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [confirmedTimestamp])

  if (!confirmedTimestamp) return confirmedHeight

  const blockTimestamp = new Date(confirmedTimestamp).getTime()
  if (Number.isNaN(blockTimestamp) || avgBlockTime <= 0) return confirmedHeight

  const elapsedSeconds = (currentTime - blockTimestamp) / 1000
  const estimatedBlocksPassed = Math.floor(elapsedSeconds / avgBlockTime)

  return confirmedHeight + estimatedBlocksPassed
}
