import { useEffect, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TimelineResponse } from '../types/inference'
import { apiFetch, formatCountdown } from '../utils'
import { useEstimatedBlock } from '../hooks/useEstimatedBlock'
import { EpochTimer } from './EpochTimer'
import { StatItem } from './common/StatItem'
import { EpochIdDisplay } from './common/EpochIdDisplay'
import { RefreshControlFooter } from './common/RefreshControlFooter'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'

export function Timeline() {
  const [hoveredBlock, setHoveredBlock] = useState<number | null>(null)
  const [hoveredEpoch, setHoveredEpoch] = useState<number | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [targetHeight, setTargetHeight] = useState<number | null>(null)
  const [urlBlock, setUrlBlock] = useState<number | null>(null)
  const detailedTimelineRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery<TimelineResponse>({
    queryKey: ['timeline'],
    queryFn: () => apiFetch('/v1/timeline'),
    staleTime: 60000,
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  })

  useEffect(() => {
    if (!data) return

    const params = new URLSearchParams(window.location.search)
    const blockParam = params.get('block')
    const heightParam = params.get('height')
    
    const detailedMinBlock = data.current_block.height
    const detailedMaxBlock = data.current_block.height + data.epoch_length
    
    if (blockParam) {
      const blockHeight = parseInt(blockParam)
      if (!isNaN(blockHeight)) {
        setHoveredBlock(blockHeight)
        setUrlBlock(blockHeight)
        
        if (blockHeight >= detailedMinBlock && blockHeight <= detailedMaxBlock) {
          setTimeout(() => {
            detailedTimelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 100)
        }
      }
    }
    
    if (heightParam) {
      const height = parseInt(heightParam)
      if (!isNaN(height)) {
        setTargetHeight(height)
        
        if (height >= detailedMinBlock && height <= detailedMaxBlock) {
          setTimeout(() => {
            detailedTimelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 100)
        }
      }
    }
  }, [data])

  const estimatedCurrentBlock = useEstimatedBlock(
    data?.current_block.height || 0,
    data?.current_block.timestamp || new Date().toISOString(),
    data?.avg_block_time || 6,
  )

  const getEstimatedCurrentBlock = (): number => {
    return data ? estimatedCurrentBlock : 0
  }

  const calculateBlockTime = (blockHeight: number): { utc: string; local: string } => {
    if (!data) return { utc: '', local: '' }

    const currentHeight = getEstimatedCurrentBlock()
    const blockTimestamp = new Date(data.current_block.timestamp).getTime()
    const currentTime = Date.now()
    const elapsedSinceBlock = currentTime - blockTimestamp
    const blockDiff = blockHeight - currentHeight
    const timeDiff = blockDiff * data.avg_block_time * 1000

    const estimatedTime = new Date(blockTimestamp + elapsedSinceBlock + timeDiff)
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }

    return {
      utc: estimatedTime.toLocaleString('en-US', { ...options, timeZone: 'UTC' }) + ' UTC',
      local: estimatedTime.toLocaleString('en-US', { ...options, timeZoneName: 'short' }),
    }
  }

  const handleTimelineClick = (blockHeight: number) => {
    setHoveredBlock(blockHeight)
    const params = new URLSearchParams(window.location.search)
    params.set('block', blockHeight.toString())
    window.history.replaceState({}, '', `?${params.toString()}`)
  }

  if (isLoading && !data) {
    return <LoadingScreen label="Loading timeline..." />
  }

  if (error && !data) {
    return <ErrorScreen error={error} />
  }

  if (!data) return null

  const minBlock = data.reference_block.height
  
  const twoMonthsInSeconds = 60 * 24 * 3600
  const blocksInTwoMonths = Math.ceil(twoMonthsInSeconds / data.avg_block_time)
  
  let maxBlock = data.current_block.height + blocksInTwoMonths
  
  const maxEventBlock = Math.max(...data.events.map(e => e.block_height))
  if (maxEventBlock > maxBlock) {
    maxBlock = maxEventBlock + Math.floor(blocksInTwoMonths * 0.1)
  }
  
  const blockRange = maxBlock - minBlock

  const getEpochData = () => {
    const epochs: Array<{ block: number; epochNumber: number }> = []
    
    let epochStart = data.current_epoch_start
    let epochNum = data.current_epoch_index
    
    while (epochStart >= minBlock) {
      epochs.push({ block: epochStart, epochNumber: epochNum })
      epochStart -= data.epoch_length
      epochNum--
    }
    
    epochStart = data.current_epoch_start + data.epoch_length
    epochNum = data.current_epoch_index + 1
    while (epochStart <= maxBlock) {
      epochs.push({ block: epochStart, epochNumber: epochNum })
      epochStart += data.epoch_length
      epochNum++
    }
    
    return epochs.sort((a, b) => a.block - b.block)
  }

  const epochData = getEpochData()

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <section className="surface border-gradient-top p-4 sm:p-5 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5 mb-4">
          <div className="col-span-2 sm:col-span-1">
            <EpochIdDisplay epochId={data.current_epoch_index} isCurrent={true} />
          </div>

          <div className="border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-5 sm:pt-0 sm:pl-5 lg:pl-6">
            <StatItem label="Current Block" subText={<>Last confirmed: {data.current_block.height.toLocaleString()}</>}>
              {getEstimatedCurrentBlock().toLocaleString()}
            </StatItem>
          </div>

          <div className="border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-5 sm:pt-0 sm:pl-5 lg:pl-6">
            <StatItem label="Avg Block Time" subText="">{data.avg_block_time.toFixed(2)}s</StatItem>
          </div>

          <EpochTimer 
            data={{
              epoch_id: data.current_epoch_index,
              height: data.current_block.height,
              participants: [],
              is_current: true,
              current_block_height: data.current_block.height,
              current_block_timestamp: data.current_block.timestamp,
              avg_block_time: data.avg_block_time,
              next_poc_start_block: data.epoch_stages?.next_poc_start,
              set_new_validators_block: data.epoch_stages?.set_new_validators,
            }}
          />
        </div>

        <RefreshControlFooter
          refreshInterval="60s"
          dataUpdatedAt={dataUpdatedAt}
          isLoading={isLoading}
          onRefresh={() => refetch()}
        />
      </section>

      <section ref={detailedTimelineRef} className="surface p-4 sm:p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="section-title">Next Epoch</h2>
          {(() => {
            const detailedMinBlock = Math.max(0, data.current_block.height - 200)
            const detailedMaxBlock = data.current_block.height + data.epoch_length
            const blockToShow = targetHeight || urlBlock
            
            if (blockToShow && blockToShow >= detailedMinBlock && blockToShow <= detailedMaxBlock) {
              const currentEstimatedBlock = getEstimatedCurrentBlock()
              
              const blocksUntilTarget = blockToShow - currentEstimatedBlock
              const secondsUntilTarget = Math.max(0, blocksUntilTarget * data.avg_block_time)
              
              if (blocksUntilTarget > 0) {
                return (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
                    <div className="text-slate-300">
                      Time to block <span className="font-semibold text-slate-50">{blockToShow.toLocaleString()}</span>:
                    </div>
                    <div className="font-bold text-accent-300">{formatCountdown(secondsUntilTarget)}</div>
                    <div className="text-slate-400">(~{Math.ceil(secondsUntilTarget / data.avg_block_time).toLocaleString()} blocks)</div>
                  </div>
                )
              } else {
                return (
                  <div className="text-sm text-slate-300 break-words">
                    Block <span className="font-semibold text-slate-50">{blockToShow.toLocaleString()}</span> has passed
                  </div>
                )
              }
            }
            return null
          })()}
        </div>
        
        <div className="relative mt-6 sm:mt-8 overflow-x-auto">
          {(() => {
            const detailedMinBlock = Math.max(0, data.current_block.height - 200)
            const detailedMaxBlock = data.current_block.height + data.epoch_length + 500
            const detailedBlockRange = detailedMaxBlock - detailedMinBlock

            const futureEvents: Array<{ block: number; label: string; fullLabel: string }> = []
            if (data.epoch_stages?.set_new_validators
              && data.epoch_stages.set_new_validators > data.current_block.height
              && data.epoch_stages.set_new_validators <= detailedMaxBlock) {
              futureEvents.push({
                block: data.epoch_stages.set_new_validators,
                label: 'New Validators',
                fullLabel: 'Set New Validators',
              })
            }
            if (data.epoch_stages?.inference_validation_cutoff
              && data.epoch_stages.inference_validation_cutoff > data.current_block.height
              && data.epoch_stages.inference_validation_cutoff <= detailedMaxBlock) {
              futureEvents.push({
                block: data.epoch_stages.inference_validation_cutoff,
                label: 'Val Cutoff',
                fullLabel: 'Inference Validation Cutoff',
              })
            }
            if (data.epoch_stages?.next_poc_start
              && data.epoch_stages.next_poc_start > data.current_block.height
              && data.epoch_stages.next_poc_start <= detailedMaxBlock) {
              futureEvents.push({
                block: data.epoch_stages.next_poc_start,
                label: `PoC ${data.current_epoch_index + 1} Start`,
                fullLabel: `PoC ${data.current_epoch_index + 1} Start`,
              })
            }
            if (data.next_epoch_stages?.set_new_validators
              && data.next_epoch_stages.set_new_validators > data.current_block.height
              && data.next_epoch_stages.set_new_validators <= detailedMaxBlock) {
              futureEvents.push({
                block: data.next_epoch_stages.set_new_validators,
                label: 'New Validators',
                fullLabel: 'Set New Validators',
              })
            }
            
            if (data.epoch_stages?.next_poc_start && data.epoch_length) {
              const secondPocStart = data.epoch_stages.next_poc_start + data.epoch_length
              if (secondPocStart > data.current_block.height && secondPocStart <= detailedMaxBlock) {
                futureEvents.push({
                  block: secondPocStart,
                  label: `PoC ${data.current_epoch_index + 2} Start`,
                  fullLabel: `PoC ${data.current_epoch_index + 2} Start`,
                })
              }
            }
            
            if (data.next_epoch_stages?.set_new_validators
              && data.next_epoch_stages?.next_poc_start
              && data.next_epoch_stages?.poc_start) {
              const offset = data.next_epoch_stages.set_new_validators - data.next_epoch_stages.poc_start
              const secondSetValidators = data.next_epoch_stages.next_poc_start + offset
              if (secondSetValidators > data.current_block.height && secondSetValidators <= detailedMaxBlock) {
                futureEvents.push({
                  block: secondSetValidators,
                  label: 'New Validators',
                  fullLabel: 'Set New Validators (Epoch +2)',
                })
              }
            }
            
            if (data.next_epoch_stages?.inference_validation_cutoff
              && data.next_epoch_stages.inference_validation_cutoff > data.current_block.height
              && data.next_epoch_stages.inference_validation_cutoff <= detailedMaxBlock) {
              futureEvents.push({
                block: data.next_epoch_stages.inference_validation_cutoff,
                label: 'Val Cutoff',
                fullLabel: 'Inference Validation Cutoff (Next Epoch)',
              })
            }

            const tickBlocks = []
            const firstTick = Math.ceil(detailedMinBlock / 100) * 100
            for (let block = firstTick; block <= detailedMaxBlock; block += 100) {
              tickBlocks.push(block)
            }

            const milestoneBlocks = []
            const firstMilestone = Math.ceil(detailedMinBlock / 1000) * 1000
            for (let block = firstMilestone; block <= detailedMaxBlock; block += 1000) {
              milestoneBlocks.push(block)
            }

            const currentEpochSetValidators = data.epoch_stages?.set_new_validators
            const validationCutoff = data.epoch_stages?.inference_validation_cutoff
            const setValidators = data.next_epoch_stages?.set_new_validators

            return (
              <svg
                width="1200"
                height="280"
                viewBox="0 0 1200 280"
                className="min-w-[1000px] sm:min-w-[1200px] overflow-visible cursor-pointer"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const ratio = x / rect.width
                  const block = Math.round(detailedMinBlock + ratio * detailedBlockRange)
                  setHoveredBlock(block)
                  setMousePosition({ x: e.clientX, y: e.clientY })
                }}
                onMouseLeave={() => {
                  setHoveredBlock(null)
                  setMousePosition(null)
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const ratio = x / rect.width
                  const block = Math.round(detailedMinBlock + ratio * detailedBlockRange)
                  handleTimelineClick(block)
                }}
              >
                {(() => {
                  const currentPocStart = data.current_epoch_start
                  if (currentEpochSetValidators && currentEpochSetValidators >= detailedMinBlock && currentPocStart <= detailedMaxBlock) {
                    return (
                      <rect
                        x={`${((Math.max(currentPocStart, detailedMinBlock) - detailedMinBlock) / detailedBlockRange) * 100}%`}
                        y="40"
                        width={`${((Math.min(currentEpochSetValidators, detailedMaxBlock) - Math.max(currentPocStart, detailedMinBlock)) / detailedBlockRange) * 100}%`}
                        height="200"
                        fill="rgba(248,113,113,0.16)"
                        opacity="0.5"
                      />
                    )
                  }
                  return null
                })()}

                {validationCutoff && setValidators && setValidators >= detailedMinBlock && validationCutoff <= detailedMaxBlock && (
                  <rect
                    x={`${((Math.max(validationCutoff, detailedMinBlock) - detailedMinBlock) / detailedBlockRange) * 100}%`}
                    y="40"
                    width={`${((Math.min(setValidators, detailedMaxBlock) - Math.max(validationCutoff, detailedMinBlock)) / detailedBlockRange) * 100}%`}
                    height="200"
                    fill="rgba(248,113,113,0.16)"
                    opacity="0.5"
                  />
                )}

                {(() => {
                  const nextValidationCutoff = data.next_epoch_stages?.inference_validation_cutoff
                  const nextPocStart = data.next_epoch_stages?.next_poc_start
                  const nextSetValidators = data.next_epoch_stages?.set_new_validators
                  const nextEpochPocStart = data.next_epoch_stages?.poc_start
                  
                  if (!nextValidationCutoff || !nextPocStart || !nextSetValidators || !nextEpochPocStart) return null
                  
                  const offset = nextSetValidators - nextEpochPocStart
                  const secondSetValidators = nextPocStart + offset
                  
                  if (secondSetValidators >= detailedMinBlock && nextValidationCutoff <= detailedMaxBlock) {
                    return (
                      <rect
                        x={`${((Math.max(nextValidationCutoff, detailedMinBlock) - detailedMinBlock) / detailedBlockRange) * 100}%`}
                        y="40"
                        width={`${((Math.min(secondSetValidators, detailedMaxBlock) - Math.max(nextValidationCutoff, detailedMinBlock)) / detailedBlockRange) * 100}%`}
                        height="200"
                        fill="rgba(248,113,113,0.16)"
                        opacity="0.5"
                      />
                    )
                  }
                  return null
                })()}

                <line
                  x1="0"
                  y1="140"
                  x2="100%"
                  y2="140"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="2"
                />

                {tickBlocks.map((block, idx) => {
                  const position = ((block - detailedMinBlock) / detailedBlockRange) * 100
                  if (position < 0 || position > 100) return null
                  
                  return (
                    <line
                      key={`tick-${idx}`}
                      x1={`${position}%`}
                      y1="130"
                      x2={`${position}%`}
                      y2="150"
                      stroke="rgba(255,255,255,0.14)"
                      strokeWidth="1"
                      opacity="0.3"
                    />
                  )
                })}

                {milestoneBlocks.map((block, idx) => {
                  const position = ((block - detailedMinBlock) / detailedBlockRange) * 100
                  if (position < 0 || position > 100) return null
                  
                  return (
                    <g key={`milestone-${idx}`}>
                      <line
                        x1={`${position}%`}
                        y1="120"
                        x2={`${position}%`}
                        y2="160"
                        stroke="rgba(255,255,255,0.22)"
                        strokeWidth="1.5"
                        opacity="0.5"
                      />
                      <text
                        x={`${position}%`}
                        y="175"
                        textAnchor="middle"
                        className="text-xs" fill="rgb(125,134,150)"
                        style={{ fontSize: '10px' }}
                      >
                        {block.toLocaleString()}
                      </text>
                    </g>
                  )
                })}

                <line
                  x1={`${((data.current_block.height - detailedMinBlock) / detailedBlockRange) * 100}%`}
                  y1="80"
                  x2={`${((data.current_block.height - detailedMinBlock) / detailedBlockRange) * 100}%`}
                  y2="200"
                  stroke="rgb(247,248,250)"
                  strokeWidth="3"
                />
                <text
                  x={`${((data.current_block.height - detailedMinBlock) / detailedBlockRange) * 100}%`}
                  y="70"
                  textAnchor="start"
                  className="text-sm font-semibold" fill="rgb(247,248,250)"
                >
                  Current
                </text>

                {futureEvents.map((event, idx) => {
                  const position = ((event.block - detailedMinBlock) / detailedBlockRange) * 100
                  if (position < 0 || position > 100) return null
                  
                  const isBottom = idx % 2 === 0
                  const labelY = isBottom ? 250 : 30
                  const lineY1 = isBottom ? 200 : 80
                  
                  const sameRowEvents = futureEvents.filter((_e, i) => (i % 2 === 0) === isBottom)
                  const indexInRow = sameRowEvents.findIndex(e => e.block === event.block)
                  const totalInRow = sameRowEvents.length
                  
                  let textAnchor: 'start' | 'middle' | 'end' = 'middle'
                  
                  if (totalInRow > 1) {
                    if (indexInRow === 0) {
                      textAnchor = 'end'
                    } else if (indexInRow === totalInRow - 1) {
                      textAnchor = 'start'
                    }
                  } else {
                    if (position < 20) {
                      textAnchor = 'start'
                    } else if (position > 80) {
                      textAnchor = 'end'
                    }
                  }
                  
                  return (
                    <g
                      key={idx}
                      className="cursor-pointer transition-all"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTimelineClick(event.block)
                      }}
                    >
                      <line
                        x1={`${position}%`}
                        y1={lineY1}
                        x2={`${position}%`}
                        y2="140"
                        stroke="rgb(62,229,177)"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                      <circle
                        cx={`${position}%`}
                        cy="140"
                        r="5"
                        fill="rgb(62,229,177)"
                      />
                      <text
                        x={`${position}%`}
                        y={labelY}
                        textAnchor={textAnchor}
                        className="text-xs font-semibold"
                        fill="rgb(62,229,177)"
                      >
                        {event.label}
                      </text>
                      <text
                        x={`${position}%`}
                        y={labelY + 12}
                        textAnchor={textAnchor}
                        className="text-xs"
                        fill="rgb(62,229,177)"
                      >
                        {event.block.toLocaleString()}
                      </text>
                    </g>
                  )
                })}

                {(() => {
                  const blockToShow = targetHeight || urlBlock
                  if (blockToShow && blockToShow >= detailedMinBlock && blockToShow <= detailedMaxBlock) {
                    return (
                      <g>
                        <line
                          x1={`${((blockToShow - detailedMinBlock) / detailedBlockRange) * 100}%`}
                          y1="80"
                          x2={`${((blockToShow - detailedMinBlock) / detailedBlockRange) * 100}%`}
                          y2="200"
                          stroke="rgb(192,132,252)"
                          strokeWidth="3"
                          strokeDasharray="6 3"
                        />
                        <circle
                          cx={`${((blockToShow - detailedMinBlock) / detailedBlockRange) * 100}%`}
                          cy="140"
                          r="8"
                          fill="rgb(192,132,252)"
                        />
                        <text
                          x={`${((blockToShow - detailedMinBlock) / detailedBlockRange) * 100}%`}
                          y="270"
                          textAnchor="middle"
                          className="text-xs font-semibold"
                          fill="rgb(192,132,252)"
                        >
                          Target
                        </text>
                        <text
                          x={`${((blockToShow - detailedMinBlock) / detailedBlockRange) * 100}%`}
                          y="215"
                          textAnchor="middle"
                          className="text-xs"
                          fill="rgb(192,132,252)"
                        >
                          {blockToShow.toLocaleString()}
                        </text>
                      </g>
                    )
                  }
                  return null
                })()}

                {hoveredBlock !== null && hoveredBlock >= detailedMinBlock && hoveredBlock <= detailedMaxBlock && (
                  <line
                    x1={`${((hoveredBlock - detailedMinBlock) / detailedBlockRange) * 100}%`}
                    y1="80"
                    x2={`${((hoveredBlock - detailedMinBlock) / detailedBlockRange) * 100}%`}
                    y2="200"
                    stroke="rgb(251,191,36)"
                    strokeWidth="2"
                    opacity="0.5"
                  />
                )}
              </svg>
            )
          })()}
        </div>
      </section>

      <section className="surface p-4 sm:p-5 md:p-6">
        <div className="mb-4">
          <h2 className="section-title mb-1">2-Month Timeline</h2>
          <div className="text-sm text-slate-300 break-words">
            Range: {minBlock.toLocaleString()} - {maxBlock.toLocaleString()} 
            <span className="block sm:inline text-slate-400 sm:ml-2 mt-1 sm:mt-0">
              (~{Math.round(blocksInTwoMonths / (24 * 3600 / data.avg_block_time))} days range)
            </span>
          </div>
        </div>
        <div className="relative mt-6 sm:mt-8 overflow-x-auto">
          <svg
            width="1200"
            height="220"
            viewBox="0 0 1400 220"
            className="min-w-[1100px] sm:min-w-[1400px] overflow-visible cursor-pointer"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              const ratio = x / rect.width
              const block = Math.round(minBlock + ratio * blockRange)
              setHoveredBlock(block)
              setMousePosition({ x: e.clientX, y: e.clientY })
            }}
            onMouseLeave={() => {
              setHoveredBlock(null)
              setMousePosition(null)
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              const ratio = x / rect.width
              const block = Math.round(minBlock + ratio * blockRange)
              handleTimelineClick(block)
            }}
          >
            <line
              x1="0"
              y1="110"
              x2="100%"
              y2="110"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="2"
            />

            {epochData.map((epoch, idx) => {
              const position = ((epoch.block - minBlock) / blockRange) * 100
              if (position < 0 || position > 100) return null
              
              const showLabel = epoch.epochNumber % 3 === 0
              
              return (
                <g
                  key={`epoch-${idx}`}
                  className="cursor-pointer"
                  onMouseEnter={(e) => {
                    e.stopPropagation()
                    setHoveredBlock(epoch.block)
                    setHoveredEpoch(epoch.epochNumber)
                    setMousePosition({ x: e.clientX, y: e.clientY })
                  }}
                  onMouseLeave={() => {
                    setHoveredEpoch(null)
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleTimelineClick(epoch.block)
                  }}
                >
                  <line
                    x1={`${position}%`}
                    y1="90"
                    x2={`${position}%`}
                    y2="130"
                    stroke="rgba(255,255,255,0.14)"
                    strokeWidth="1.5"
                    opacity="0.5"
                  />
                  {showLabel && (
                    <text
                      x={`${position}%`}
                      y="145"
                      textAnchor="middle"
                      className="text-xs" fill="rgb(125,134,150)"
                      style={{ fontSize: '10px' }}
                    >
                      E{epoch.epochNumber}
                    </text>
                  )}
                </g>
              )
            })}

            <line
              x1={`${((data.current_block.height - minBlock) / blockRange) * 100}%`}
              y1="70"
              x2={`${((data.current_block.height - minBlock) / blockRange) * 100}%`}
              y2="150"
              stroke="rgb(247,248,250)"
              strokeWidth="3"
            />
            <text
              x={`${((data.current_block.height - minBlock) / blockRange) * 100}%`}
              y="170"
              textAnchor="start"
              className="text-sm font-semibold" fill="rgb(247,248,250)"
            >
              Current
            </text>

            {data.events.map((event, idx) => {
              const position = ((event.block_height - minBlock) / blockRange) * 100
              if (position < 0 || position > 100) return null
              
              const isPast = event.occurred
              const color = isPast ? '#6B7280' : '#3B82F6'
              
              return (
                <g
                  key={idx}
                  className="cursor-pointer transition-all"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleTimelineClick(event.block_height)
                  }}
                >
                  <line
                    x1={`${position}%`}
                    y1="50"
                    x2={`${position}%`}
                    y2="170"
                    stroke={color}
                    strokeWidth="3"
                    strokeDasharray="4 2"
                  />
                  <circle
                    cx={`${position}%`}
                    cy="110"
                    r="6"
                    fill={color}
                  />
                  <text
                    x={`${position}%`}
                    y="40"
                    textAnchor="middle"
                    className="text-xs font-semibold"
                    fill={color}
                  >
                    {event.description}
                  </text>
                  <text
                    x={`${position}%`}
                    y="190"
                    textAnchor="middle"
                    className="text-xs"
                    fill={color}
                  >
                    {event.block_height.toLocaleString()}
                  </text>
                </g>
              )
            })}

            {hoveredBlock !== null && (
              <line
                x1={`${((hoveredBlock - minBlock) / blockRange) * 100}%`}
                y1="70"
                x2={`${((hoveredBlock - minBlock) / blockRange) * 100}%`}
                y2="150"
                stroke="rgb(251,191,36)"
                strokeWidth="2"
                opacity="0.5"
              />
            )}
          </svg>
        </div>

        {hoveredBlock !== null && mousePosition && (
          <div
            className="fixed z-50 surface-raised text-slate-50 px-4 py-3 rounded-lg shadow-pop text-sm pointer-events-none"
            style={{
              left: mousePosition.x + 10,
              top: mousePosition.y - 80,
            }}
          >
            {hoveredEpoch !== null ? (
              <>
                <div className="font-semibold">Epoch {hoveredEpoch} Start</div>
                <div className="text-xs text-slate-500 mt-1">Block {hoveredBlock.toLocaleString()}</div>
                <div className="text-xs text-slate-600 mt-1">
                  {calculateBlockTime(hoveredBlock).utc}
                </div>
                <div className="text-xs text-slate-600">
                  {calculateBlockTime(hoveredBlock).local}
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold">Block {hoveredBlock.toLocaleString()}</div>
                <div className="text-xs text-slate-600 mt-1">
                  {calculateBlockTime(hoveredBlock).utc}
                </div>
                <div className="text-xs text-slate-600">
                  {calculateBlockTime(hoveredBlock).local}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="surface p-4 sm:p-5 md:p-6">
        <h2 className="section-title mb-4">Network Events</h2>

        {data.events.length === 0 ? (
          <p className="text-slate-500 text-sm">No events scheduled</p>
        ) : (
          <div className="space-y-2.5">
            {data.events.map((event, index) => {
              const eventTime = calculateBlockTime(event.block_height)
              const isPast = event.occurred

              return (
                <div
                  key={index}
                  className={`group surface-inset p-4 cursor-pointer transition-all duration-200 ease-out-expo hover:-translate-y-0.5 ${
                    isPast
                      ? 'opacity-75 hover:opacity-100'
                      : 'border-accent-400/30 bg-accent-500/[0.04] hover:bg-accent-500/[0.08]'
                  }`}
                  onClick={() => handleTimelineClick(event.block_height)}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="font-semibold text-slate-50 break-words tracking-tight">{event.description}</span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[10.5px] font-semibold rounded-md tracking-wide ${
                            isPast
                              ? 'bg-white/[0.06] text-slate-400 border border-white/[0.06]'
                              : 'bg-accent-500/12 text-accent-300 border border-accent-400/30'
                          }`}
                        >
                          {isPast ? 'PAST' : 'UPCOMING'}
                        </span>
                      </div>
                      <div className="text-sm text-slate-400 tabular-nums">
                        <span className="text-slate-500">Block</span>{' '}
                        <span className="font-mono text-slate-200">#{event.block_height.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-sm text-slate-300 md:text-right break-words tabular-nums">
                      <div>{eventTime.utc}</div>
                      <div className="text-xs text-slate-500">{eventTime.local}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
