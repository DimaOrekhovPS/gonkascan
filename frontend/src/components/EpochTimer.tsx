import { useEffect, useState } from 'react'
import { InferenceResponse } from '../types/inference'
import { formatCountdown } from '../utils'
import { StatItem } from './common/StatItem'

interface EpochTimerProps {
  data: InferenceResponse
}

export function EpochTimer({ data }: EpochTimerProps) {
  const [currentTime, setCurrentTime] = useState(Date.now())

  useEffect(() => {
    setCurrentTime(Date.now())
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [data.current_block_timestamp])

  if (!data.next_poc_start_block || !data.current_block_height || !data.current_block_timestamp || !data.avg_block_time) {
    return <StatItem label="Time To Next Epoch" subText="">—</StatItem>
  }

  const serverTime = new Date(data.current_block_timestamp).getTime()
  const elapsedSeconds = (currentTime - serverTime) / 1000
  const estimatedBlocksPassed = elapsedSeconds / data.avg_block_time
  const estimatedCurrentBlock = Math.floor(data.current_block_height + estimatedBlocksPassed)

  const isPocInProgress = data.set_new_validators_block
    && estimatedCurrentBlock >= data.next_poc_start_block
    && estimatedCurrentBlock < data.set_new_validators_block

  if (isPocInProgress) {
    return (
      <StatItem label="Time To Next Epoch" subText="">
        <span className="inline-flex items-center gap-2">
          <span>PoC in Progress</span>
          <span className="h-2 w-2 bg-accent-400 rounded-full animate-live-pulse shadow-[0_0_8px_rgba(62,229,177,0.7)]" />
        </span>
      </StatItem>
    )
  }

  const blocksUntilNextEpoch = data.next_poc_start_block - data.current_block_height
  const secondsUntilNextEpochFromServer = blocksUntilNextEpoch * data.avg_block_time
  const secondsRemaining = Math.max(0, secondsUntilNextEpochFromServer - elapsedSeconds)
  const blocksRemaining = Math.ceil(secondsRemaining / data.avg_block_time)

  return (
    <StatItem
      label="Next Epoch In"
      subText={<>~{blocksRemaining > 0 ? blocksRemaining.toLocaleString() : 0} blocks remaining</>}
    >
      {formatCountdown(secondsRemaining)}
    </StatItem>
  )
}
