import { useMemo } from 'react'
import { useUrlParam } from '../hooks/useUrlParam'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { timeAgo, apiFetch } from '../utils'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'

type BlockItem = {
  height: number
  tx_count: number
  timestamp: string
}

type BlocksResponse = {
  blocks: BlockItem[]
}

export function Blocks() {
  const [, setSelectedHeight] = useUrlParam('height')

  const { data, isLoading, error, refetch } = useQuery<BlocksResponse>({
    queryKey: ['blocks', 'recent'],
    queryFn: () => apiFetch('/v1/blocks/recent'),
    staleTime: 10000,
    refetchInterval: 10000,
    refetchOnMount: true,
  })

  const blocks = useMemo(() => {
    if (!data?.blocks) return []
    return [...data.blocks].sort((a, b) => b.height - a.height)
  }, [data])

  const latestBlocks = useMemo(() => blocks.slice(0, 30), [blocks])

  const chartData = useMemo(() => {
    return [...blocks].slice().reverse().map((b) => ({
      height: b.height,
      txs: b.tx_count,
    }))
  }, [blocks])

  const handleRefresh = () => refetch()

  if (isLoading && !data) return <LoadingScreen label="Loading blocks" />
  if (error && !data) return <ErrorScreen error={error} title="Failed to load blocks" onRetry={handleRefresh} />
  if (!data) return null

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <section className="surface p-4 sm:p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-title">Recent Blocks</h2>
            <p className="section-subtitle mt-1 flex items-center gap-2">
              <span className="live-dot" aria-hidden />
              <span>Live transactions per block</span>
            </p>
          </div>
        </div>

        <div className="surface-inset p-3 sm:p-4 w-full overflow-x-hidden">
          <div className="h-[220px] sm:h-[240px] md:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3ee5b1" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#0fb083" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="height"
                  tick={{ fontSize: 11, fill: 'rgb(115,124,140)' }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  tickLine={false}
                  tickFormatter={(v) => v.toString()}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'rgb(115,124,140)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(19, 23, 28, 0.98)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                    boxShadow: '0 16px 40px -8px rgba(0,0,0,0.6)',
                    padding: '8px 12px',
                    color: 'rgb(247,248,250)',
                    backdropFilter: 'blur(12px)',
                  }}
                  itemStyle={{ color: 'rgb(167, 243, 208)' }}
                  labelStyle={{ color: 'rgb(247,248,250)', fontWeight: 600, marginBottom: 4 }}
                  cursor={{ fill: 'rgba(62,229,177,0.08)' }}
                  formatter={(v: number) => [`${v} txs`, 'Txs']}
                  labelFormatter={(l) => `Block #${l}`}
                />
                <Bar dataKey="txs" fill="url(#bar-gradient)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {latestBlocks.map((block) => (
          <div
            key={block.height}
            onClick={() => {
              const height = block.height.toString()
              setSelectedHeight(height)
              const params = new URLSearchParams(window.location.search)
              params.set('page', 'blocks')
              params.set('height', height)
              window.history.pushState({}, '', `?${params}`)
            }}
            className="group relative surface surface-hover cursor-pointer p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.06] group-hover:bg-accent-500/10 group-hover:border-accent-400/30 transition-all" aria-hidden>
                <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-accent-400 transition-colors" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
              </span>
              <span className="text-[11px] font-medium text-accent-300 whitespace-nowrap tabular-nums">{timeAgo(block.timestamp)}</span>
            </div>

            <div className="text-base sm:text-lg font-mono font-bold text-slate-50 break-all tabular-nums tracking-tight">
              <span className="text-slate-500 mr-0.5">#</span>{block.height.toLocaleString()}
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.25V18a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18V8.25m-18 0V6a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 6v2.25m-18 0h18" />
              </svg>
              <span className="tabular-nums font-medium text-slate-200">{block.tx_count}</span>
              <span>{block.tx_count === 1 ? 'transaction' : 'transactions'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
