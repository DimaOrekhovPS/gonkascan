import { useEffect, useMemo, useState } from 'react'
import { useUrlParam } from '../hooks/useUrlParam'
import { useQuery } from '@tanstack/react-query'
import { GovernanceProposal } from '../types/inference'
import { apiFetch, formatDateWithOrdinal, formatCompact, formatMessageTypes } from '../utils'
import LoadingScreen from './common/LoadingScreen'
import ErrorScreen from './common/ErrorScreen'
import { TabBar } from './common/TabBar'

type Tab = 'voting' | 'passed' | 'rejected'

const PAGE_SIZE = 20

export function Governance() {
  const [, setSelectedProposalId] = useUrlParam('proposal_id')
  const [tab, setTab] = useState<Tab | null>(null)
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useQuery<Record<Tab, GovernanceProposal[]>>({
    queryKey: ['governance-proposals'],
    queryFn: () => apiFetch('/v1/proposals'),
  })

  const effectiveTab: Tab = useMemo(() => {
    if (!data) return 'passed'
    if (data.voting?.length > 0) return 'voting'
    return 'passed'
  }, [data])

  useEffect(() => {
    if (!data) return
    if (tab !== null) return
  
    if (data.voting?.length > 0) {
      setTab('voting')
    } else {
      setTab('passed')
    }
  }, [data, tab])

  const activeTab = tab ?? effectiveTab

  const list: GovernanceProposal[] = useMemo(() => {
    if (!data) return []
    const raw = data[activeTab] || []
    return [...raw].sort((a, b) => b.id - a.id)
  }, [data, activeTab])

  const totalPages = Math.ceil(list.length / PAGE_SIZE)
  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (isLoading) {
    return <LoadingScreen label="Loading proposals..." />
  }

  if (error || !data) {
    return <ErrorScreen error={error} title="Failed to load proposals" />
  }

  return (
    <div className="surface p-4 sm:p-5 md:p-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5 sm:mb-6">
        <div>
          <h2 className="section-title">Proposals</h2>
          <p className="section-subtitle mt-1">Approved proposals are executed to update the network</p>
        </div>

        <TabBar
          tabs={['voting', 'passed', 'rejected'] as Tab[]}
          activeTab={activeTab}
          onChange={(t) => { setTab(t); setPage(1) }}
          variant="pill"
        />
      </div>

      {activeTab === 'voting' && list.length === 0 ? (
        <div className="surface-inset py-14 sm:py-20 text-center px-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-4">
            <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div className="text-base sm:text-lg font-semibold text-slate-200 mb-1.5">No active proposals right now</div>
          <div className="text-sm text-slate-500">Check back later to see what&apos;s up for voting.</div>
        </div>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden overflow-x-auto border border-white/[0.06]">
            <div className="grid min-w-[900px] grid-cols-[3fr_1fr_3fr_1.5fr_1.5fr] bg-white/[0.02] px-4 py-3 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.14em]">
              <div>Proposal</div>
              <div>Epoch</div>
              <div>Votes</div>
              <div className="text-center">Weight</div>
              <div className="text-center">Voters</div>
            </div>

            {paged.map((p) => {
              const yes = Number(p.final_tally_result?.yes_count || 0)
              const no = Number(p.final_tally_result?.no_count || 0)
              const abstain = Number(p.final_tally_result?.abstain_count || 0)
              const veto = Number(p.final_tally_result?.no_with_veto_count || 0)

              const voteItems = [
                yes > 0 && { value: yes, color: 'text-accent-300' },
                no > 0 && { value: no, color: 'text-red-300' },
                abstain > 0 && { value: abstain, color: 'text-violet-300' },
                veto > 0 && { value: veto, color: 'text-slate-400' },
              ].filter(Boolean) as { value: number; color: string }[]

              const votes = [
                { key: 'yes', label: 'Yes', value: yes, color: 'bg-accent-400', text: 'text-accent-300' },
                { key: 'no', label: 'No', value: no, color: 'bg-red-400', text: 'text-red-300' },
                { key: 'abstain', label: 'Abstain', value: abstain, color: 'bg-violet-400', text: 'text-violet-300' },
                { key: 'veto', label: 'Veto', value: veto, color: 'bg-slate-500', text: 'text-slate-400' },
              ].filter((v) => v.value > 0)

              const totalVotes = votes.reduce((s, v) => s + v.value, 0)
              const dominant = votes.reduce(
                (a, b) => (b.value > a.value ? b : a),
                votes[0],
              )

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedProposalId(String(p.id))
                    const params = new URLSearchParams(window.location.search)
                    params.set('page', 'governance')
                    params.set('proposal_id', String(p.id))
                    window.history.pushState({}, '', `?${params.toString()}`)
                  }}
                  className="group grid min-w-[900px] grid-cols-[3fr_1fr_3fr_1.5fr_1.5fr] px-4 py-4 border-t border-white/[0.05] text-sm cursor-pointer hover:bg-white/[0.03] transition-colors duration-150"
                >
                  {/* Proposal */}
                  <div>
                    <div className="font-semibold text-slate-100 group-hover:text-accent-300 break-words transition-colors">
                      <span className="font-mono text-slate-500 mr-1">#{p.id}</span>
                      {p.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold tracking-wide ${
                          p.status.includes('PASSED')
                            ? 'bg-accent-500/12 text-accent-300 border border-accent-400/30'
                            : p.status.includes('REJECTED')
                              ? 'bg-red-500/10 text-red-300 border border-red-400/25'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-400/25'
                        }`}
                      >
                        {p.status.replace('PROPOSAL_STATUS_', '')}
                      </span>
                      <span className="text-xs text-slate-500">{formatDateWithOrdinal(p.submit_time)}</span>
                    </div>
                    {formatMessageTypes(p.messages) && (
                      <div className="text-xs text-slate-500 mt-1 leading-relaxed break-words">{formatMessageTypes(p.messages)}</div>
                    )}
                  </div>

                  {/* Epoch */}
                  <div className="flex items-center font-mono font-semibold text-slate-200 tabular-nums">#{p.epoch_id}</div>

                  {/* Votes */}
                  <div className="pr-3 sm:pr-6">
                    <div className="flex flex-wrap text-xs gap-2 mb-1.5 leading-relaxed">
                      {voteItems.map((item, idx) => (
                        <span key={idx} className="flex items-center">
                          <span className={`${item.color} font-medium`}>{formatCompact(item.value)}</span>
                          {idx < voteItems.length - 1 && (
                            <span className="mx-1.5 text-slate-700 text-sm leading-none relative -top-[1px]">·</span>
                          )}
                        </span>
                      ))}
                    </div>
                    <div className="relative group/bar">
                      <div className="h-2.5 w-full bg-white/[0.04] rounded-full overflow-hidden flex">
                        {votes.map((v) => {
                          const pct = (v.value / totalVotes) * 100
                          return (
                            <div
                              key={v.key}
                              className={`${v.color} h-full transition-all duration-500 ease-out-expo`}
                              style={{ width: `${pct}%` }}
                            />
                          )
                        })}
                      </div>

                      {dominant && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[10px] font-bold text-night-50 drop-shadow tabular-nums">
                            {((dominant.value / totalVotes) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}

                      <div className="absolute left-1/2 -top-2 translate-x-[-50%] -translate-y-full opacity-0 group-hover/bar:opacity-100 transition rounded-lg bg-night-300 border border-white/[0.10] px-3 py-2 text-xs shadow-pop whitespace-nowrap z-10 hidden sm:block">
                        {votes.map((v) => (
                          <div key={v.key} className={`flex items-center gap-2 ${v.text}`}>
                            <span className="inline-block w-2 h-2 rounded-full bg-current" />
                            <span>{v.label}: {formatCompact(v.value)} ({((v.value / totalVotes) * 100).toFixed(2)}%)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Weight */}
                  <div className="flex items-center justify-center text-center font-medium break-words text-slate-300 tabular-nums">
                    {p.total_weight > 0
                      ? `${formatCompact(p.voted_weight).toLocaleString()} / ${formatCompact(p.total_weight).toLocaleString()}`
                      : `${formatCompact(p.voted_weight).toLocaleString()} / —`}
                  </div>

                  {/* Voters */}
                  <div className="flex items-center justify-center text-center font-medium break-words text-slate-300 tabular-nums">
                    {p.total_voters}/{p.total_participants}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between sm:justify-end gap-3 mt-5">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-secondary"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Prev
          </button>
          <span className="text-sm font-medium text-slate-400 tabular-nums whitespace-nowrap">
            <span className="text-slate-50 font-bold">{page}</span> <span className="text-slate-600">/</span> {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary"
          >
            Next
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
