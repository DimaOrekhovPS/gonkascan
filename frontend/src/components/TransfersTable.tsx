import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AddressTransfersResponse, TransferTransaction } from '../types/inference'
import { toGonka, formatGNK, timeAgo, apiFetch, shortHash } from '../utils'
import { usePopover } from '../hooks/usePopover'
import { FilterIcon } from './common/FilterIcon'
import { FilterListPopover } from './common/FilterListPopover'
import { FilterSearchPopover } from './common/FilterSearchPopover'
import { LoadMoreBar } from './common/LoadMoreBar'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'

interface TransfersTableProps {
  address: string
}

const PAGE_SIZE = 20

const DURATION_PRESETS = [
  { label: 'LAST 1H', hours: 1 },
  { label: 'LAST 24H', hours: 24 },
  { label: 'LAST 7D', hours: 7 * 24 },
  { label: 'LAST 30D', hours: 30 * 24 },
  { label: 'LAST 90D', hours: 90 * 24 },
  { label: 'LAST 180D', hours: 180 * 24 },
]

const STATUS_OPTIONS = [
  { label: 'Success', value: 'success' },
  { label: 'Fail', value: 'failed' },
]

function formatTransferAmount(tx: TransferTransaction, address: string) {
  const isOutgoing = tx.from_address === address
  const coin = tx.amount.find(a => a.denom === 'ngonka' || a.denom === 'gonka') || tx.amount[0]
  if (!coin) return { text: '-', color: '' }
  const gonka = coin.denom === 'ngonka' ? toGonka(coin.amount) : Number(coin.amount)
  const sign = isOutgoing ? '-' : '+'
  const color = isOutgoing ? 'text-red-300' : 'text-accent-400'
  return { text: `${sign}${formatGNK(gonka)}`, color }
}

export function TransfersTable({ address }: TransfersTableProps) {
  const [extraTransfers, setExtraTransfers] = useState<TransferTransaction[]>([])
  const [loadingMore, setLoadingMore] = useState(false)

  const [msgType, setMsgType] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [timeFrom, setTimeFrom] = useState<string | null>(null)
  const [timeTo, setTimeTo] = useState<string | null>(null)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [appliedFromAddr, setAppliedFromAddr] = useState<string | null>(null)
  const [appliedToAddr, setAppliedToAddr] = useState<string | null>(null)

  const typePop = usePopover()
  const statusPop = usePopover()
  const timePop = usePopover()
  const fromPop = usePopover()
  const toPop = usePopover()

  const buildQs = useCallback((customOffset: number) => {
    const params = new URLSearchParams()
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(customOffset))
    if (msgType) params.set('msg_type', msgType)
    if (timeFrom) params.set('time_from', timeFrom)
    if (timeTo) params.set('time_to', timeTo)
    return params.toString()
  }, [msgType, timeFrom, timeTo])

  const { data, isLoading, error } = useQuery<AddressTransfersResponse>({
    queryKey: ['address-transfers', address, msgType, timeFrom, timeTo],
    queryFn: () => apiFetch(`/v1/transfers/${address}?${buildQs(0)}`) as Promise<AddressTransfersResponse>,
    enabled: !!address,
  })

  // Reset extra data when filters change (useQuery refetches the first page)
  useEffect(() => {
    setExtraTransfers([])
  }, [msgType, timeFrom, timeTo])

  const { data: typesData } = useQuery<{ types: string[] }>({
    queryKey: ['address-transfer-types', address],
    queryFn: () => apiFetch(`/v1/transfers/${address}/types`),
    enabled: !!address,
  })

  const typeOptions = useMemo(() =>
    (typesData?.types || []).map(t => ({ label: t, value: t })),
  [typesData])

  const allTransfers = useMemo(() => {
    if (!data) return []
    return [...data.transfers, ...extraTransfers]
  }, [data, extraTransfers])

  const total = data?.total ?? 0

  const list = useMemo(() => {
    let result = allTransfers
    if (statusFilter) result = result.filter(t => t.status === statusFilter)
    if (appliedFromAddr) result = result.filter(t => t.from_address.toLowerCase().includes(appliedFromAddr.toLowerCase()))
    if (appliedToAddr) result = result.filter(t => t.to_address.toLowerCase().includes(appliedToAddr.toLowerCase()))
    return result
  }, [allTransfers, statusFilter, appliedFromAddr, appliedToAddr])

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const offset = (data?.transfers.length ?? 0) + extraTransfers.length
      const result = await apiFetch(
        `/v1/transfers/${address}?${buildQs(offset)}`
      ) as AddressTransfersResponse
      setExtraTransfers(prev => [...prev, ...result.transfers])
    } finally {
      setLoadingMore(false)
    }
  }, [address, data, extraTransfers.length, buildQs])

  function applyPreset(hours: number) {
    const from = new Date(Date.now() - hours * 3600 * 1000)
    setTimeFrom(from.toISOString())
    setTimeTo(null)
    setCustomFrom('')
    setCustomTo('')
    timePop.close()
  }

  function applyCustomTime() {
    setTimeFrom(customFrom ? new Date(customFrom).toISOString() : null)
    setTimeTo(customTo ? new Date(customTo + 'T23:59:59Z').toISOString() : null)
    timePop.close()
  }

  function clearTime() {
    setTimeFrom(null)
    setTimeTo(null)
    setCustomFrom('')
    setCustomTo('')
    timePop.close()
  }

  function closeAllPopovers() {
    typePop.close()
    statusPop.close()
    timePop.close()
    fromPop.close()
    toPop.close()
  }

  if (isLoading) return <LoadingScreen label="Loading transfers..." className="py-10" />
  if (error) return <ErrorScreen error={error} title="Failed to load transfers" className="py-10" />
  if (allTransfers.length === 0) {
    return <div className="text-center py-6 sm:py-8 text-sm text-slate-500">No transfers found</div>
  }

  return (
    <>
      {/* Mobile: stacked cards (more readable than horizontal scroll) */}
      <div className="sm:hidden space-y-2.5">
        {list.map((tx, idx) => {
          const amt = formatTransferAmount(tx, address)
          const isOutgoing = tx.from_address === address
          return (
            <a
              key={`${tx.tx_hash}-${idx}-mobile`}
              href={`?page=transactions&tx=${tx.tx_hash.toUpperCase()}`}
              className="block surface-inset p-3 hover:bg-white/[0.04] transition-colors"
            >
              {/* Row 1: direction + amount + status */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg ${
                      isOutgoing
                        ? 'bg-red-500/10 text-red-300 border border-red-400/25'
                        : 'bg-accent-500/12 text-accent-300 border border-accent-400/30'
                    }`}
                    aria-hidden
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
                      {isOutgoing ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 17l9.2-9.2M17 17V7H7" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 7l-9.2 9.2M7 7v10h10" />
                      )}
                    </svg>
                  </span>
                  <span className={`text-base font-bold tabular-nums truncate ${amt.color}`}>{amt.text}</span>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md tracking-wide ${
                  tx.status === 'success'
                    ? 'bg-accent-500/12 text-accent-300 border border-accent-400/30'
                    : 'bg-red-500/10 text-red-300 border border-red-400/25'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${tx.status === 'success' ? 'bg-accent-400' : 'bg-red-400'}`} />
                  {tx.status === 'success' ? 'OK' : 'Fail'}
                </span>
              </div>

              {/* Row 2: type + time */}
              <div className="flex items-center justify-between gap-2 text-xs mb-2">
                <span className="text-slate-300 truncate">{tx.msg_type || '—'}</span>
                <span className="shrink-0 text-slate-500 tabular-nums">{tx.timestamp ? timeAgo(tx.timestamp) : '—'}</span>
              </div>

              {/* Row 3: counterparty (only show the other party) */}
              <div className="flex items-center gap-1.5 text-[12px] mb-1.5">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-8">
                  {isOutgoing ? 'To' : 'From'}
                </span>
                <span className="font-mono text-slate-200 truncate">
                  {(isOutgoing ? tx.to_address : tx.from_address) || '—'}
                </span>
              </div>

              {/* Row 4: hash + height */}
              <div className="flex items-center justify-between gap-2 text-[11px] pt-1.5 border-t border-white/[0.04]">
                <span className="font-mono text-slate-400 truncate">{shortHash(tx.tx_hash.toUpperCase(), 10)}</span>
                <span className="shrink-0 font-mono text-slate-500 tabular-nums">#{tx.height.toLocaleString()}</span>
              </div>
            </a>
          )
        })}
      </div>

      {/* Desktop: full table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="min-w-[900px] sm:min-w-full" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '15%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead className="bg-white/[0.02]">
            <tr className="border-b border-white/[0.06]">
              <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Hash</th>
              <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">
                <span className="inline-flex items-center">
                  <span>Type</span>
                  <FilterIcon active={!!msgType} onClick={(e) => { closeAllPopovers(); typePop.toggle(e) }} />
                </span>
              </th>
              <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Amount</th>
              <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">
                <span className="inline-flex items-center">
                  <span>From</span>
                  <FilterIcon active={!!appliedFromAddr} onClick={(e) => { closeAllPopovers(); fromPop.toggle(e) }} />
                </span>
              </th>
              <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">
                <span className="inline-flex items-center">
                  <span>To</span>
                  <FilterIcon active={!!appliedToAddr} onClick={(e) => { closeAllPopovers(); toPop.toggle(e) }} />
                </span>
              </th>
              <th className="px-4 py-3 text-center text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">
                <span className="inline-flex items-center">
                  <span>Status</span>
                  <FilterIcon active={!!statusFilter} onClick={(e) => { closeAllPopovers(); statusPop.toggle(e) }} />
                </span>
              </th>
              <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">Height</th>
              <th className="px-4 py-3 text-right text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] whitespace-nowrap">
                <span className="inline-flex items-center justify-end w-full">
                  <span>Time</span>
                  <FilterIcon active={!!(timeFrom || timeTo)} onClick={(e) => { closeAllPopovers(); timePop.toggle(e) }} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((tx, idx) => {
              const amt = formatTransferAmount(tx, address)
              return (
                <tr key={`${tx.tx_hash}-${idx}`} className="group border-t border-white/[0.05] hover:bg-white/[0.03] transition-colors duration-150">
                  <td className="px-4 py-3 text-sm font-mono whitespace-nowrap overflow-hidden text-ellipsis border-l-[2px] border-l-transparent group-hover:border-l-accent-400/40">
                    <a href={`?page=transactions&tx=${tx.tx_hash.toUpperCase()}`} className="text-accent-300 hover:text-accent-200 hover:underline tabular-nums" title={tx.tx_hash.toUpperCase()}>
                      {shortHash(tx.tx_hash.toUpperCase(), 8)}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis">{tx.msg_type || '—'}</td>
                  <td className={`px-4 py-3 text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis text-left tabular-nums ${amt.color}`}>{amt.text}</td>
                  <td className="px-4 py-3 text-sm font-mono whitespace-nowrap overflow-hidden text-ellipsis">
                    {tx.from_address ? (
                      <a href={`?page=address&address=${tx.from_address}`} className="text-accent-300 hover:text-accent-200 hover:underline" title={tx.from_address}>
                        {shortHash(tx.from_address, 8)}
                      </a>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono whitespace-nowrap overflow-hidden text-ellipsis">
                    {tx.to_address ? (
                      <a href={`?page=address&address=${tx.to_address}`} className="text-accent-300 hover:text-accent-200 hover:underline" title={tx.to_address}>
                        {shortHash(tx.to_address, 8)}
                      </a>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md tracking-wide ${
                      tx.status === 'success'
                        ? 'bg-accent-500/12 text-accent-300 border border-accent-400/30'
                        : 'bg-red-500/10 text-red-300 border border-red-400/25'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tx.status === 'success' ? 'bg-accent-400' : 'bg-red-400'}`} />
                      {tx.status === 'success' ? 'Success' : 'Failed'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-left whitespace-nowrap">
                    <a href={`?page=blocks&height=${tx.height}`} className="font-mono text-accent-300 hover:text-accent-200 hover:underline tabular-nums">#{tx.height.toLocaleString()}</a>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400 text-right whitespace-nowrap tabular-nums" title={tx.timestamp || ''}>
                    {tx.timestamp ? timeAgo(tx.timestamp) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <LoadMoreBar
        loaded={allTransfers.length}
        total={total}
        loading={loadingMore}
        label="Transfers"
        onLoadMore={handleLoadMore}
      />

      <FilterListPopover popover={typePop} title="" options={typeOptions} selected={msgType} onSelect={setMsgType} />
      <FilterListPopover popover={statusPop} title="" options={STATUS_OPTIONS} selected={statusFilter} onSelect={setStatusFilter} width="w-32" />
      <FilterSearchPopover popover={fromPop} placeholder="Search by address e.g. gonka1..." value={appliedFromAddr} onApply={setAppliedFromAddr} />
      <FilterSearchPopover popover={toPop} placeholder="Search by address e.g. gonka1..." value={appliedToAddr} onApply={setAppliedToAddr} />

      {timePop.open && (
        <div
          ref={timePop.popoverRef}
          className="fixed z-[9999] surface-raised p-4 w-[min(18rem,calc(100vw-1rem))]"
          style={{ top: timePop.pos.top, left: timePop.pos.left }}
        >
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">Quick presets</div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {DURATION_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.hours)}
                className="text-xs font-medium px-3 h-7 rounded-md bg-white/[0.04] text-slate-200 hover:bg-white/[0.07] border border-white/[0.06] transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">Custom range</div>
          <div className="space-y-2 mb-4">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="input h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">To</label>
              <input
                type="date"
                value={customTo || new Date().toISOString().split('T')[0]}
                onChange={e => setCustomTo(e.target.value)}
                className="input h-9 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={applyCustomTime} className="btn-primary flex-1 h-9 text-sm">Apply</button>
            <button onClick={clearTime} className="btn-secondary flex-1 h-9 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </>
  )
}
