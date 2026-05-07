import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GovernanceProposal } from '../types/inference'
import { apiFetch } from '../utils'

type Tab = 'voting' | 'passed' | 'rejected'

function useCountdown(endTime?: string) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!endTime) return null

  const diff = new Date(endTime).getTime() - now
  if (diff <= 0) return 'Ended'

  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}

function ProposalCard({
  proposal,
  onClick,
}: {
  proposal: GovernanceProposal
  onClick: () => void
}) {
  const countdown = useCountdown(proposal.voting_end_time)

  const tally = proposal.final_tally_result || {}
  const yes = Number(tally.yes_count || 0)
  const no = Number(tally.no_count || 0)
  const abstain = Number(tally.abstain_count || 0)
  const veto = Number(tally.no_with_veto_count || 0)
  const totalVotes = yes + no + abstain + veto

  const votes = [
    { key: 'yes', label: 'Yes', value: yes, color: 'bg-accent-400', text: 'text-accent-300' },
    { key: 'no', label: 'No', value: no, color: 'bg-red-400', text: 'text-red-300' },
    { key: 'abstain', label: 'Abstain', value: abstain, color: 'bg-violet-400', text: 'text-violet-300' },
    { key: 'veto', label: 'Veto', value: veto, color: 'bg-slate-500', text: 'text-slate-400' },
  ].filter((v) => v.value > 0)

  return (
    <div
      onClick={onClick}
      className="group relative surface-inset px-4 py-3.5 cursor-pointer transition-all duration-300 ease-out-expo
        hover:bg-white/[0.04] hover:border-white/[0.10] hover:-translate-y-0.5"
    >
      <span
        className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full bg-accent-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-[0_0_8px_rgba(62,229,177,0.5)]"
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
        <span className="shrink-0 inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded-md text-[10px] font-bold tabular-nums bg-white/[0.06] text-slate-300 border border-white/[0.08]">
          #{proposal.id}
        </span>
        <h3 className="font-semibold text-slate-100 text-sm truncate min-w-0 flex-1 sm:flex-none group-hover:text-accent-300 transition-colors">
          {proposal.title}
        </h3>
        <span className="shrink-0 text-xs text-slate-500 tabular-nums">
          Voters {proposal.total_voters}/{proposal.total_participants}
        </span>
        {countdown && (
          <span className="shrink-0 sm:ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-400/25 tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            {countdown}
          </span>
        )}
      </div>

      {totalVotes > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
          <div className="flex items-center gap-2 shrink-0">
            {votes.map((v) => (
              <span key={v.key} className={`${v.text} text-[11px] font-medium tabular-nums whitespace-nowrap`}>
                {v.label} {((v.value / totalVotes) * 100).toFixed(1)}%
              </span>
            ))}
          </div>
          <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden flex">
            {votes.map((v) => (
              <div
                key={v.key}
                className={`${v.color} h-full transition-all duration-500 ease-out-expo`}
                style={{ width: `${(v.value / totalVotes) * 100}%` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ActiveProposals() {
  const [showAll, setShowAll] = useState(false)

  const { data } = useQuery<Record<Tab, GovernanceProposal[]>>({
    queryKey: ['governance-proposals'],
    queryFn: () => apiFetch('/v1/proposals'),
    staleTime: 30000,
  })

  const votingProposals = useMemo(() => {
    if (!data?.voting) return []
    return [...data.voting].sort((a, b) => b.id - a.id)
  }, [data])

  const filtered = useMemo(() => {
    if (showAll || votingProposals.length <= 1) return votingProposals
    const significant = votingProposals.filter(
      (p) => p.total_weight > 0 && p.voted_weight / p.total_weight >= 0.01,
    )
    return significant.length > 0 ? significant : votingProposals
  }, [votingProposals, showAll])

  if (votingProposals.length === 0) return null

  const handleClick = (id: number) => {
    const params = new URLSearchParams()
    params.set('page', 'governance')
    params.set('proposal_id', String(id))
    window.history.pushState({}, '', `?${params.toString()}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const hasHidden = !showAll && filtered.length < votingProposals.length

  return (
    <section className="surface p-4 sm:p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="section-title flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/10 border border-amber-400/25">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
            </span>
            Active Proposals
          </h2>
          <span className="text-xs sm:text-sm text-slate-500 tabular-nums">
            {votingProposals.length} {votingProposals.length === 1 ? 'proposal' : 'proposals'} currently in voting
          </span>
        </div>
        {hasHidden && (
          <button
            onClick={() => setShowAll(true)}
            className="text-sm font-medium text-accent-300 hover:text-accent-200 transition-colors"
          >
            Show all ({votingProposals.length}) →
          </button>
        )}
        {showAll && votingProposals.length > 1 && (
          <button
            onClick={() => setShowAll(false)}
            className="text-sm font-medium text-accent-300 hover:text-accent-200 transition-colors"
          >
            Show significant only
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {filtered.map((p) => (
          <ProposalCard key={p.id} proposal={p} onClick={() => handleClick(p.id)} />
        ))}
      </div>
    </section>
  )
}
