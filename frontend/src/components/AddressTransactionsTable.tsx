import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AddressTransactionsResponse, Transaction } from '../types/inference'
import { timeAgo, apiFetch } from '../utils'
import { LoadMoreBar } from './common/LoadMoreBar'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'

const PAGE_SIZE = 20

interface AddressTransactionsTableProps {
  address: string
}

export function AddressTransactionsTable({ address }: AddressTransactionsTableProps) {
  const [extraTransactions, setExtraTransactions] = useState<Transaction[]>([])
  const [loadingMore, setLoadingMore] = useState(false)

  const { data, isLoading, error } = useQuery<AddressTransactionsResponse>({
    queryKey: ['address-transactions', address],
    queryFn: () => apiFetch(`/v1/transactions/${address}?limit=${PAGE_SIZE}&offset=0`) as Promise<AddressTransactionsResponse>,
    enabled: !!address,
  })

  const allTransactions = useMemo(() => {
    if (!data) return []
    return [...data.transactions, ...extraTransactions]
  }, [data, extraTransactions])

  const total = data?.total ?? 0

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const offset = (data?.transactions.length ?? 0) + extraTransactions.length
      const result = await apiFetch(
        `/v1/transactions/${address}?limit=${PAGE_SIZE}&offset=${offset}`
      ) as AddressTransactionsResponse
      setExtraTransactions(prev => [...prev, ...result.transactions])
    } finally {
      setLoadingMore(false)
    }
  }, [address, data, extraTransactions.length])

  if (isLoading) {
    return <LoadingScreen label="Loading transactions..." className="py-10" />
  }

  if (error) {
    return <ErrorScreen error={error} title="Failed to load transactions" className="py-10" />
  }

  if (allTransactions.length === 0) {
    return (
      <div className="text-center py-6 sm:py-8 text-sm text-slate-500">No transactions found for this address</div>
    )
  }

  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="sm:hidden space-y-2.5">
        {allTransactions.map((tx) => (
          <a
            key={`${tx.tx_hash}-mobile`}
            href={`?page=transactions&tx=${tx.tx_hash.toUpperCase()}`}
            className="block surface-inset p-3 hover:bg-white/[0.04] transition-colors"
          >
            {/* Row 1: status + height + time */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md tracking-wide ${
                tx.status === 'success'
                  ? 'bg-accent-500/12 text-accent-300 border border-accent-400/30'
                  : 'bg-red-500/10 text-red-300 border border-red-400/25'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${tx.status === 'success' ? 'bg-accent-400' : 'bg-red-400'}`} />
                {tx.status === 'success' ? 'Success' : 'Failed'}
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">{tx.timestamp ? timeAgo(tx.timestamp) : '—'}</span>
            </div>

            {/* Row 2: messages */}
            {tx.messages.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {tx.messages.slice(0, 3).map((m, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-300 border border-white/[0.06] text-[11px] font-medium"
                  >
                    {m}
                  </span>
                ))}
                {tx.messages.length > 3 && (
                  <span className="text-[11px] text-slate-500 self-center">+{tx.messages.length - 3}</span>
                )}
              </div>
            )}

            {/* Row 3: hash + height */}
            <div className="flex items-center justify-between gap-2 text-[11px] pt-1.5 border-t border-white/[0.04]">
              <span className="font-mono text-slate-300 truncate">{tx.tx_hash.toUpperCase()}</span>
              <span className="shrink-0 font-mono text-slate-500 tabular-nums">#{tx.height.toLocaleString()}</span>
            </div>
          </a>
        ))}
      </div>

      {/* Desktop: full table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="min-w-[640px] sm:min-w-full">
          <thead className="bg-white/[0.02]">
            <tr className="border-b border-white/[0.06]">
              <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Height</th>
              <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Hash</th>
              <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Messages</th>
              <th className="px-4 py-3 text-center text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Time</th>
            </tr>
          </thead>

          <tbody>
            {allTransactions.map((tx) => (
              <tr key={tx.tx_hash} className="group border-t border-white/[0.05] hover:bg-white/[0.03] transition-colors duration-150">
                <td className="px-4 py-3 text-sm whitespace-nowrap border-l-[2px] border-l-transparent group-hover:border-l-accent-400/40">
                  <a
                    href={`?page=blocks&height=${tx.height}`}
                    rel="noopener noreferrer"
                    className="font-mono text-accent-300 hover:text-accent-200 hover:underline tabular-nums"
                  >
                    #{tx.height.toLocaleString()}
                  </a>
                </td>
                <td className="px-4 py-3 text-sm font-mono whitespace-nowrap">
                  <a
                    href={`?page=transactions&tx=${tx.tx_hash.toUpperCase()}`}
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-slate-200 hover:text-accent-300 transition-colors"
                  >
                    <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-accent-500/60 group-hover:bg-accent-400 transition-colors" aria-hidden />
                    <span className="block max-w-[200px] sm:max-w-[420px] truncate" title={tx.tx_hash.toUpperCase()}>
                      {tx.tx_hash.toUpperCase()}
                    </span>
                  </a>
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
                <td className="px-4 py-3 text-center text-sm whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md tracking-wide ${
                    tx.status === 'success'
                      ? 'bg-accent-500/12 text-accent-300 border border-accent-400/30'
                      : 'bg-red-500/10 text-red-300 border border-red-400/25'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${tx.status === 'success' ? 'bg-accent-400' : 'bg-red-400'}`} />
                    {tx.status === 'success' ? 'Success' : 'Failed'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-sm text-slate-400 whitespace-nowrap tabular-nums" title={tx.timestamp || ''}>
                  {tx.timestamp ? timeAgo(tx.timestamp) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LoadMoreBar
        loaded={allTransactions.length}
        total={total}
        loading={loadingMore}
        label="Transactions"
        onLoadMore={handleLoadMore}
      />
    </>
  )
}
