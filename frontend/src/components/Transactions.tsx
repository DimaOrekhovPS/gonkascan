import { useQuery } from '@tanstack/react-query'
import { useUrlParam } from '../hooks/useUrlParam'
import { ClockIcon } from '@heroicons/react/24/outline'
import { TransactionsResponse } from '../types/inference'
import { apiFetch, formatDateTime } from '../utils'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'

export function Transactions() {
  const [selectedTxHash, setSelectedTxHash] = useUrlParam('tx')

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<TransactionsResponse>({
    queryKey: ['transactions'],
    queryFn: () => apiFetch('/v1/transactions'),
    staleTime: 10000,
    refetchInterval: 10000,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  })

  const handleRefresh = () => refetch()

  if (isLoading && !data) return <LoadingScreen label="Loading transactions" />
  if (error && !data) return <ErrorScreen error={error} onRetry={handleRefresh} />
  if (!data) return null

  const secondsAgo = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : null

  return (
    <div className="animate-fade-in">
      <section className="surface p-4 sm:p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="section-title">Recent Transactions</h2>
            <p className="section-subtitle mt-1 flex items-center gap-2">
              <span className="live-dot" aria-hidden />
              <span>
                Auto-refresh every <span className="font-semibold text-slate-200">10s</span>
                {secondsAgo !== null && <span className="text-slate-500"> · synced {secondsAgo}s ago</span>}
              </span>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="min-w-full">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[10%]">Height</th>
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[50%]">Hash</th>
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[20%]">Messages</th>
                <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[20%]">Time</th>
              </tr>
            </thead>

            <tbody>
              {data.transactions.map((tx) => {
                const isSelected = selectedTxHash === tx.tx_hash.toUpperCase()
                return (
                  <tr
                    key={tx.tx_hash}
                    onClick={() => {
                      const hash = tx.tx_hash.toUpperCase()
                      setSelectedTxHash(hash)
                      const params = new URLSearchParams(window.location.search)
                      params.set('page', 'transactions')
                      params.set('tx', hash)
                      window.history.pushState({}, '', `?${params}`)
                    }}
                    className={`group cursor-pointer border-t border-white/[0.05] transition-colors duration-150 ${
                      isSelected ? 'bg-accent-500/[0.07]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <a
                        href={`?page=blocks&height=${tx.height}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center font-mono text-accent-300 hover:text-accent-200 hover:underline tabular-nums"
                        title={tx.height.toString()}
                      >
                        #{tx.height}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-200 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-accent-500/60 group-hover:bg-accent-400 group-hover:shadow-[0_0_6px_rgba(62,229,177,0.6)] transition-all" aria-hidden />
                        <span className="block max-w-[200px] sm:max-w-[420px] md:max-w-[560px] truncate" title={tx.tx_hash.toUpperCase()}>
                          {tx.tx_hash.toUpperCase()}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {tx.messages.slice(0, 2).map((m, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-300 border border-white/[0.06] text-[11px] font-medium whitespace-nowrap"
                          >
                            {m}
                          </span>
                        ))}
                        {tx.messages.length > 2 && (
                          <span className="text-[11px] text-slate-500">+{tx.messages.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 tabular-nums">
                        <ClockIcon className="w-3.5 h-3.5 text-slate-500" />
                        <span>{tx.timestamp ? formatDateTime(tx.timestamp) : '—'}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
