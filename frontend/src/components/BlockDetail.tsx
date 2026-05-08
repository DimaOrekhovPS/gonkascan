import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BlockDetailResponse, CosmosMessage, TxRowData, TxStatus } from '../types/inference'
import { formatCompact, apiFetch, shortHash, formatDateTime, toGonka } from '../utils'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'
import { BackNavigation } from './common/BackNavigation'

type MsgSummaryNode = {
  key: string
  totalCount: number
  totalGas: number
  failedCount: number
  failedGas: number
  creators?: Record<string, {count: number, gas: number}>
}

function typeTail(typeUrl: string) {
  const tail = typeUrl.split('/').pop() || typeUrl
  const dotTail = tail.split('.').pop() || tail  
  const cleaned = dotTail.replace(/^Msg/, '')
  return cleaned
}

function extractCreatorsFromAny(anyMsg: CosmosMessage): string[] {
  const creators = new Set<string>()
  if (!anyMsg || typeof anyMsg !== 'object') return []
  const typeUrl = anyMsg['@type']

  if (typeUrl === '/cosmos.authz.v1beta1.MsgExec' && Array.isArray(anyMsg.msgs)) {
    for (const inner of anyMsg.msgs) {
      const creator = inner?.creator
      if (typeof creator === 'string' && creator.length > 0) {
        creators.add(creator)
      }
    }
    return Array.from(creators)
  }

  if (typeUrl === '/cosmwasm.wasm.v1.MsgExecuteContract') {
    const sender = anyMsg?.sender
    if (typeof sender === 'string' && sender.length > 0) {
      creators.add(sender)
    }
    return Array.from(creators)
  }

  const creator = anyMsg?.creator
  if (typeof creator === 'string' && creator.length > 0) {
    creators.add(creator)
  }

  return Array.from(creators)
}

function extractMsgTypeCountsFromAny(anyMsg: CosmosMessage): {isExec: boolean, counts: Map<string, number>} { 
  const counts = new Map<string, number>()

  if (!anyMsg || typeof anyMsg !== 'object') {
    return { isExec: false, counts }
  }

  const isExec = anyMsg['@type'] === '/cosmos.authz.v1beta1.MsgExec' && Array.isArray(anyMsg.msgs)
  if (isExec && anyMsg.msgs) {
    for (const inner of anyMsg.msgs) {
      const typeUrl = inner['@type']
      if (!typeUrl || typeof typeUrl !== 'string') continue
      const type = typeTail(typeUrl)
      counts.set(type, (counts.get(type) || 0) + 1)
    }

    if (counts.size === 0) {
      counts.set('Exec', 1)
    }

    return { isExec: true, counts }
  }

  if (typeof anyMsg['@type'] === 'string') {
    const type = typeTail(anyMsg['@type'])
    counts.set(type, 1)
  }

  return { isExec: false, counts }
}

function MsgSummaryRow({ node }: { node: MsgSummaryNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        className="grid grid-cols-[1fr_220px_220px] sm:grid-cols-[1fr_260px_260px] px-4 sm:px-5 md:px-6 py-3 border-b border-white/[0.05] cursor-pointer hover:bg-white/[0.03] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 text-slate-100 font-medium min-w-0">
          <svg
            className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="truncate font-mono text-[13px]" title={node.key}>{node.key}</span>
        </div>

        <div className="text-right text-sm text-slate-200 tabular-nums">
          {node.totalCount} <span className="text-slate-500">/</span> {formatCompact(node.totalGas, 2, false)}
        </div>

        <div className="text-right text-sm tabular-nums">
          {node.failedCount > 0 ? (
            <span className="text-red-300">{node.failedCount} <span className="text-red-400/60">/</span> {formatCompact(node.failedGas, 2, false)}</span>
          ) : (
            <span className="text-slate-600">— / —</span>
          )}
        </div>
      </div>

      {open && node.creators && (
        <>
          {Object.entries(node.creators)
            .sort(([, a], [, b]) => b.count - a.count)
            .map(([addr, creator]) => (
              <div
                key={addr}
                className="grid grid-cols-[1fr_220px_220px] sm:grid-cols-[1fr_260px_260px] px-8 sm:px-12 py-2 text-sm border-b border-white/[0.04] bg-white/[0.015] hover:bg-white/[0.04] transition-colors"
              >
                <a
                  href={`/?page=address&address=${addr}`}
                  className="text-accent-300 hover:text-accent-200 hover:underline font-mono truncate block min-w-0"
                >
                  {addr}
                </a>
                <div className="text-right text-slate-300 tabular-nums">{creator.count} <span className="text-slate-500">/</span> {formatCompact(creator.gas, 2, false)}</div>
                <div className="text-right text-slate-600">— / —</div>
              </div>
            ))}
        </>
      )}
    </>
  )
}

function TxRow({ row }: { row: TxRowData }) {
  const [showError, setShowError] = useState(false)
  const isFailed = row.status === 'Failed' && row.errorLog

  return (
    <tr
      className="border-t border-white/[0.05] hover:bg-white/[0.03] transition-colors"
      onMouseLeave={() => setShowError(false)}
    >
      <td className="px-4 py-3 font-mono text-[13px] text-slate-100 truncate" title={row.msgType}>{row.msgType}</td>

      {isFailed && showError ? (
        <td colSpan={4} className="px-4 py-3">
          <div className="flex gap-3 surface-inset px-3 py-2 border-l-[2px] border-l-red-400">
            <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all leading-relaxed">Error: {row.errorLog}</pre>
          </div>
        </td>
      ) : (
        <>
          <td className="px-4 py-3 whitespace-nowrap">
            {row.status === 'Success' && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md tracking-wide bg-accent-500/12 text-accent-300 border border-accent-400/30">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
                Success
              </span>
            )}
            {row.status === 'Failed' && (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md tracking-wide bg-red-500/10 text-red-300 border border-red-400/25 cursor-help"
                onMouseEnter={() => setShowError(true)}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Failed
              </span>
            )}
            {row.status === 'Unknown' && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md tracking-wide bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                Unknown
              </span>
            )}
          </td>

          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap font-mono tabular-nums leading-relaxed">
            <span className="text-slate-200">{toGonka(row.gasUsed)}</span> <span className="text-slate-600">used</span>
            <br />
            <span className="text-slate-300">{toGonka(row.gasWanted)}</span> <span className="text-slate-600">wanted</span>
          </td>
          <td className="px-4 py-3 font-mono text-sm truncate" title={row.creator}>
            {row.creator !== '-' ? (
              <a
                href={`/?page=address&address=${row.creator}`}
                className="text-accent-300 hover:text-accent-200 hover:underline truncate block"
              >
                {shortHash(row.creator, 16)}
              </a>
            ) : (
              <span className="text-slate-600">—</span>
            )}
          </td>
          <td className="px-4 py-3 font-mono text-sm">
            <a
              href={`?page=transactions&tx=${row.txhash}`}
              className="block w-full truncate text-accent-300 hover:text-accent-200 hover:underline"
              title={row.txhash}
            >
              {row.txhash}
            </a>
          </td>
        </>
      )}
    </tr>
  )
}

export function BlockDetail({ height }: {height: string }) {
  const { data, isLoading, error } = useQuery<BlockDetailResponse>({
    queryKey: ['block', height],
    queryFn: () => apiFetch(`/v1/block/${height}`),
    enabled: !!height,
  })

  const txRows = useMemo(() => {
    if (!data) return []
  
    const txs = data.data?.txs || []
    const results = data.result?.txs_results || []
  
    return txs.flatMap((tx, txIndex) => {
      const txhash = (tx.hash || '').toUpperCase()
      const body = tx.body || {}
      const auth = tx.auth_info || {}
      const gasLimit = auth.fee?.gas_limit?.toString?.() ?? '-'
  
      const result = results[txIndex]
      const status: TxStatus = result?.code === 0 ? 'Success' : result?.code != null ? 'Failed': 'Unknown'
      const gasUsed = result?.gas_used ?? '-'
      const gasWanted = result?.gas_wanted ?? gasLimit

      const messages = body?.messages ?? []
  
      return messages.flatMap((anyMsg: CosmosMessage, msgIndex: number) => {
        const creators = extractCreatorsFromAny(anyMsg)
        const creator = 
            creators.length === 1 ? creators[0] : creators.length > 1
              ? `${creators[0]} +${creators.length - 1}` : '-'
        const { isExec, counts } = extractMsgTypeCountsFromAny(anyMsg)
        const prefix = isExec ? 'Exec > ' : ''
            
        return Array.from(counts.entries()).map(([innerType, count], idx) => ({
          key: `${txIndex}-${msgIndex}-${idx}`,
          txhash,
          msgType: count > 1 ? `${prefix}${innerType} × ${count}` : `${prefix}${innerType}`,
          creator,
          status,
          gasUsed,
          gasWanted,
          errorLog: result?.log ?? null, 
        }))
      })
    })
  }, [data])
  
  const msgSummary = useMemo(() => {
    const map = new Map<string, MsgSummaryNode>()
  
    for (const row of txRows) {
      const key = row.msgType
  
      if (!map.has(key)) {
        map.set(key, {
          key,
          totalCount: 0,
          totalGas: 0,
          failedCount: 0,
          failedGas: 0,
          creators: {},
        })
      }
  
      const node = map.get(key)!
      const gas = Number(row.gasUsed) || 0
  
      node.totalCount += 1
      node.totalGas += gas
  
      if (row.status === 'Failed') {
        node.failedCount += 1
        node.failedGas += gas
      }
  
      if (row.creator && row.creator !== '-') {
        const creator = row.creator
        if (!node.creators![creator]) {
          node.creators![creator] = { count: 0, gas: 0 }
        }
        node.creators![creator].count += 1
        node.creators![creator].gas += gas
      }
    }
  
    return Array.from(map.values())
  }, [txRows])

  if (isLoading) {
    return <LoadingScreen label="Loading block..." />
  }

  if (error || !data) {
    return <ErrorScreen error={error} title="Failed to load block" />
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <div className="mb-1">
        <BackNavigation
          onBack={() => window.history.back()}
          backLabel="Back to Blocks"
          title={<><span className="text-slate-500 font-mono">#</span>{Number(data.header.height).toLocaleString()}</>}
        />
      </div>

      <section className="surface p-4 sm:p-5 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">Height</div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-slate-50 tabular-nums tracking-tight break-all">
              <span className="text-slate-500 mr-0.5">#</span>{Number(data.header.height).toLocaleString()}
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">Time</div>
            <div className="text-base sm:text-lg text-slate-100 break-words tabular-nums">{formatDateTime(data.header.time)}</div>
          </div>
        </div>
      </section>

      <section className="surface p-0 overflow-hidden">
        <div className="px-4 sm:px-5 md:px-6 pt-4 sm:pt-5 pb-3">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">Message summary</h3>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1fr_220px_220px] sm:grid-cols-[1fr_260px_260px] px-4 sm:px-5 md:px-6 py-3 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] border-y border-white/[0.06] bg-white/[0.02]">
              <div>Msg type</div>
              <div className="text-right">Total (count / gas)</div>
              <div className="text-right">Failed (count / gas)</div>
            </div>
            {msgSummary
              .slice()
              .sort((a, b) => {
                if (b.totalCount !== a.totalCount) {
                  return b.totalCount - a.totalCount
                }
                return a.key.localeCompare(b.key)
              })
              .map(node => (
                <MsgSummaryRow key={node.key} node={node} />
              ))}
          </div>
        </div>
      </section>

      <section className="surface p-0 overflow-hidden">
        <div className="px-4 sm:px-5 md:px-6 pt-4 sm:pt-5 pb-3">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">Transactions</h3>
        </div>

        {/* Mobile: stacked cards */}
        <div className="sm:hidden px-3 pb-3 space-y-2">
          {txRows.map((row) => (
            <TxRowMobile key={row.key} row={row} />
          ))}
        </div>

        {/* Desktop: full table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm table-fixed">
            <thead className="bg-white/[0.02] border-y border-white/[0.06]">
              <tr>
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[20%] whitespace-nowrap">Msg type</th>
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[10%] whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[15%] whitespace-nowrap">Gas (GNK)</th>
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[25%] whitespace-nowrap">Creator</th>
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em] w-[25%] whitespace-nowrap">Tx hash</th>
              </tr>
            </thead>
            <tbody>
              {txRows.map(row => (
                <TxRow key={row.key} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function TxRowMobile({ row }: { row: TxRowData }) {
  const isFailed = row.status === 'Failed' && row.errorLog

  return (
    <a
      href={`?page=transactions&tx=${row.txhash}`}
      className="block surface-inset p-3 hover:bg-white/[0.04] transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-[13px] text-slate-100 truncate" title={row.msgType}>{row.msgType}</span>
        {row.status === 'Success' && (
          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md tracking-wide bg-accent-500/12 text-accent-300 border border-accent-400/30">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
            OK
          </span>
        )}
        {row.status === 'Failed' && (
          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md tracking-wide bg-red-500/10 text-red-300 border border-red-400/25">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            Fail
          </span>
        )}
        {row.status === 'Unknown' && (
          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md tracking-wide bg-white/[0.04] text-slate-400 border border-white/[0.06]">
            ?
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 text-[11.5px]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-12 shrink-0">Creator</span>
          {row.creator !== '-' ? (
            <span className="font-mono text-slate-300 truncate">{shortHash(row.creator, 14)}</span>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-12 shrink-0">Hash</span>
          <span className="font-mono text-slate-300 truncate">{shortHash(row.txhash, 14)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-12 shrink-0">Gas</span>
          <span className="font-mono text-slate-300 tabular-nums">
            {toGonka(row.gasUsed)} <span className="text-slate-500">/</span> {toGonka(row.gasWanted)}
          </span>
        </div>
      </div>

      {isFailed && row.errorLog && (
        <div className="mt-2 pt-2 border-t border-red-400/20">
          <pre className="text-[10.5px] text-red-300 font-mono whitespace-pre-wrap break-all leading-relaxed">{row.errorLog}</pre>
        </div>
      )}
    </a>
  )
}
